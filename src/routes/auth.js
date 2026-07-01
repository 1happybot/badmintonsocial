import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { flash } from '../middleware.js';
import { generateReferralCode } from '../points.js';
import {
  maskEmail,
  normalizeEmail,
} from '../phone-verification.js';
import { sendSignupVerificationEmail, sendPasswordResetEmail } from '../email-verification.js';

const router = express.Router();

function normalizeRefCode(value) {
  return String(value || '').trim().toUpperCase().slice(0, 16) || null;
}

async function resolveReferrerId(refCode) {
  if (!refCode) return null;
  const refRes = await query(
    'SELECT id FROM users WHERE referral_code = $1 AND is_active = TRUE',
    [refCode]
  );
  return refRes.rowCount > 0 ? refRes.rows[0].id : null;
}

async function reserveReferralCode() {
  let newReferralCode = generateReferralCode();
  for (let i = 0; i < 5; i += 1) {
    const clash = await query('SELECT 1 FROM users WHERE referral_code = $1', [newReferralCode]);
    if (clash.rowCount === 0) break;
    newReferralCode = generateReferralCode();
  }
  return newReferralCode;
}

async function createUserFromPendingSignup(pendingSignup) {
  const referrerId = await resolveReferrerId(pendingSignup.refCode);
  const newReferralCode = await reserveReferralCode();

  const inserted = await query(
    `INSERT INTO users (
       name, email, password_hash, city, country, skill_rating, shuttle_preference, bio,
       avatar_style, handedness, preferred_format, interested_in_tournaments, club_player,
       team_mode, partner_name, partner_handedness, partner_skill_rating,
       referral_code, referred_by_user_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING id`,
    [
      pendingSignup.name,
      pendingSignup.email,
      pendingSignup.passwordHash,
      pendingSignup.city,
      'Sweden',
      pendingSignup.skillRating,
      pendingSignup.shuttlePreference,
      null,
      'smash',
      'right',
      pendingSignup.preferredFormat,
      pendingSignup.interestedInTournaments,
      pendingSignup.clubPlayer,
      pendingSignup.teamMode,
      pendingSignup.partnerName,
      pendingSignup.partnerHandedness,
      pendingSignup.partnerSkillRating,
      newReferralCode,
      referrerId,
    ]
  );
  return inserted.rows[0]?.id;
}

function getPendingSignup(req) {
  return req.session.pendingSignup || null;
}

function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function getBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const ref = normalizeRefCode(req.query.ref);
  res.render('register', { title: 'Register', form: { ref }, errorMessage: null });
});

router.get('/register/verify', async (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const token = String(req.query.token || '').trim();
  if (!/^[a-f0-9]{40,128}$/i.test(token)) {
    flash(req, 'error', 'Verification link is invalid. Please sign up again.');
    return res.redirect('/register');
  }

  try {
    const tokenHash = hashToken(token);
    const verificationRes = await query(
      `SELECT id, email, pending_signup
       FROM email_verification_requests
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at >= NOW()`,
      [tokenHash]
    );

    if (verificationRes.rowCount === 0) {
      flash(req, 'error', 'Verification link is invalid or expired. Please request a new signup email.');
      return res.redirect('/register');
    }

    const verification = verificationRes.rows[0];
    const pendingSignup = verification.pending_signup;

    const existing = await query('SELECT id FROM users WHERE email = $1', [verification.email]);
    if (existing.rowCount > 0) {
      await query(
        `UPDATE email_verification_requests
         SET used_at = NOW()
         WHERE id = $1`,
        [verification.id]
      );
      flash(req, 'success', 'Email already verified. You can log in now.');
      return res.redirect('/login');
    }

    const userId = await createUserFromPendingSignup(pendingSignup);
    await query(
      `UPDATE email_verification_requests
       SET used_at = NOW()
       WHERE id = $1`,
      [verification.id]
    );
    req.session.userId = userId;
    req.session.pendingSignup = null;
    flash(req, 'success', `Welcome to TopMinton, ${pendingSignup.name}! Your email is now confirmed.`);
    return res.redirect('/challenges');
  } catch (_err) {
    flash(req, 'error', 'Could not verify your email link. Please try signing up again.');
    return res.redirect('/register');
  }
});

router.get('/register/check-email', (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const pendingSignup = getPendingSignup(req);
  if (!pendingSignup || !pendingSignup.email) {
    flash(req, 'error', 'Start signup first so we can send a confirmation email.');
    return res.redirect('/register');
  }

  return res.render('register_check_email', {
    title: 'Check your email',
    maskedEmail: maskEmail(pendingSignup.email),
  });
});

router.post('/register', async (req, res) => {
  const {
    name,
    email,
    password,
    city,
    skill_rating,
    shuttle_preference,
    preferred_format,
    interested_in_tournaments,
    club_player,
    team_mode,
    partner_name,
    partner_handedness,
    partner_skill_rating,
    accept_tos,
    ref,
  } = req.body;
  const form = {
    name,
    email,
    city,
    skill_rating,
    shuttle_preference,
    preferred_format,
    interested_in_tournaments,
    club_player,
    team_mode,
    partner_name,
    partner_handedness,
    partner_skill_rating,
    accept_tos,
    ref: normalizeRefCode(ref),
  };

  const renderRegisterError = (statusCode, message) => {
    return res.status(statusCode).render('register', {
      title: 'Register',
      form,
      errorMessage: message,
    });
  };

  const trimmedName = String(name || '').trim();
  const trimmedCity = String(city || '').trim();

  if (!name || !email || !password) {
    return renderRegisterError(400, 'Name, email and password are required.');
  }
  if (trimmedName.length < 2) {
    return renderRegisterError(400, 'Name must be at least 2 characters long.');
  }
  if (!trimmedCity) {
    return renderRegisterError(400, 'City is required. Please choose your city in Sweden.');
  }
  if (password.length < 8) {
    return renderRegisterError(400, 'Password must be at least 8 characters.');
  }
  if (accept_tos !== 'on') {
    return renderRegisterError(400, 'You must accept the Terms of Service to create an account.');
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return renderRegisterError(400, 'Enter a valid email address.');
  }
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rowCount > 0) {
    return renderRegisterError(409, 'An account with that email already exists.');
  }

  const hash = await bcrypt.hash(password, 12);
  const rating = Number.parseInt(skill_rating, 10);
  const safeRating = Number.isInteger(rating) && rating >= 1 && rating <= 10 ? rating : 5;
  const safePref = ['feathers', 'plastics', 'both'].includes(shuttle_preference) ? shuttle_preference : 'both';
  const safePreferredFormat = ['singles', 'doubles', 'both'].includes(String(preferred_format || ''))
    ? String(preferred_format)
    : 'singles';
  const isTeamMode = team_mode === 'on';
  const safePartnerName = isTeamMode ? String(partner_name || '').trim() : null;
  const safePartnerHandedness = isTeamMode && ['right', 'left', 'ambidextrous'].includes(String(partner_handedness || ''))
    ? String(partner_handedness)
    : null;
  const partnerRating = Number.parseInt(partner_skill_rating, 10);
  const safePartnerRating = isTeamMode && Number.isInteger(partnerRating) && partnerRating >= 1 && partnerRating <= 10
    ? partnerRating
    : null;

  if (isTeamMode && !safePartnerName) {
    return renderRegisterError(400, 'Partner name is required for doubles team registration.');
  }

  const teamPreferredFormat = isTeamMode && safePreferredFormat === 'singles' ? 'doubles' : safePreferredFormat;

  const refCode = normalizeRefCode(ref);

  const pendingSignup = {
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: hash,
    city: trimmedCity,
    skillRating: safeRating,
    shuttlePreference: safePref,
    preferredFormat: teamPreferredFormat,
    interestedInTournaments: interested_in_tournaments === 'on',
    clubPlayer: club_player === 'on',
    teamMode: isTeamMode,
    partnerName: safePartnerName,
    partnerHandedness: safePartnerHandedness,
    partnerSkillRating: safePartnerRating,
    refCode,
    requestedAt: Date.now(),
  };

  try {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const verificationUrl = `${getBaseUrl(req)}/register/verify?token=${token}`;

    await query(
      `DELETE FROM email_verification_requests
       WHERE email = $1
         AND used_at IS NULL`,
      [normalizedEmail]
    );

    await query(
      `INSERT INTO email_verification_requests (email, token_hash, pending_signup, expires_at)
       VALUES ($1, $2, $3::jsonb, NOW() + INTERVAL '24 hours')`,
      [normalizedEmail, tokenHash, JSON.stringify(pendingSignup)]
    );

    await sendSignupVerificationEmail({
      toEmail: normalizedEmail,
      verificationUrl,
      name: pendingSignup.name,
    });
  } catch (err) {
    if (err && typeof err.message === 'string' && err.message.startsWith('sendgrid_not_configured')) {
      const details = err.message.split(':')[1] || 'SENDGRID_API_KEY|TWILIO_API_KEY,SENDGRID_FROM_EMAIL|TWILIO_FROM_EMAIL';
      return renderRegisterError(502, `Could not send confirmation email. Missing: ${details}.`);
    }
    if (err && err.message === 'twilio_not_configured') {
      return renderRegisterError(502, 'Could not send confirmation email. Configure SENDGRID_API_KEY (or TWILIO_API_KEY) and SENDGRID_FROM_EMAIL.');
    }
    return renderRegisterError(502, 'Could not send confirmation email. Please try again.');
  }

  req.session.pendingSignup = pendingSignup;
  flash(req, 'success', `We sent a confirmation link to ${maskEmail(normalizedEmail)}.`);
  return res.redirect('/register/check-email');
});

router.post('/register/check-email/resend', async (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const pendingSignup = getPendingSignup(req);
  if (!pendingSignup) {
    flash(req, 'error', 'Start signup first so we can send your confirmation email.');
    return res.redirect('/register');
  }

  try {
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const verificationUrl = `${getBaseUrl(req)}/register/verify?token=${token}`;

    await query(
      `DELETE FROM email_verification_requests
       WHERE email = $1
         AND used_at IS NULL`,
      [pendingSignup.email]
    );
    await query(
      `INSERT INTO email_verification_requests (email, token_hash, pending_signup, expires_at)
       VALUES ($1, $2, $3::jsonb, NOW() + INTERVAL '24 hours')`,
      [pendingSignup.email, tokenHash, JSON.stringify(pendingSignup)]
    );

    await sendSignupVerificationEmail({
      toEmail: pendingSignup.email,
      verificationUrl,
      name: pendingSignup.name,
    });

    pendingSignup.requestedAt = Date.now();
    req.session.pendingSignup = pendingSignup;
    flash(req, 'success', `A new confirmation link was sent to ${maskEmail(pendingSignup.email)}.`);
  } catch (err) {
    if (err && typeof err.message === 'string' && err.message.startsWith('sendgrid_not_configured')) {
      const details = err.message.split(':')[1] || 'SENDGRID_API_KEY|TWILIO_API_KEY,SENDGRID_FROM_EMAIL|TWILIO_FROM_EMAIL';
      flash(req, 'error', `Email verification is not configured. Missing: ${details}.`);
    } else if (err && err.message === 'twilio_not_configured') {
      flash(req, 'error', 'Email verification is not configured. Set SendGrid variables for Twilio email link delivery.');
    } else {
      flash(req, 'error', 'Could not resend confirmation email. Please try again.');
    }
  }

  return res.redirect('/register/check-email');
});

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  res.render('login', { title: 'Log in', form: {} });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const result = await query('SELECT id, password_hash, is_active FROM users WHERE email = $1', [normalizedEmail]);
  const user = result.rows[0];

  const ok = user ? await bcrypt.compare(password || '', user.password_hash) : false;
  if (!ok) {
    flash(req, 'error', 'Invalid email or password.');
    return res.status(401).render('login', { title: 'Log in', form: { email } });
  }
  if (!user.is_active) {
    flash(req, 'error', 'This account has been banned. Contact an admin if you believe this is a mistake.');
    return res.status(403).render('login', { title: 'Log in', form: { email } });
  }

  req.session.userId = user.id;
  flash(req, 'success', 'Logged in.');
  res.redirect('/challenges');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// --- Forgot / reset password (users) ---


router.get('/forgot-password', (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  res.render('forgot_password', { title: 'Forgot password', form: {}, errorMessage: null, successMessage: null });
});

router.post('/forgot-password', async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body.email);
  // Always show a generic success response to prevent email enumeration.
  const okResponse = () => res.render('forgot_password', {
    title: 'Forgot password',
    form: {},
    errorMessage: null,
    successMessage: 'If an account with that email exists, a reset link has been sent.',
  });

  if (!normalizedEmail) return okResponse();

  try {
    const userRes = await query(
      'SELECT id, name, email FROM users WHERE email = $1 AND is_active = TRUE',
      [normalizedEmail]
    );
    if (userRes.rowCount > 0) {
      const user = userRes.rows[0];
      const token = randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      const resetUrl = `${getBaseUrl(req)}/reset-password?token=${token}`;

      await query(
        `DELETE FROM password_reset_requests
         WHERE user_type = 'user' AND user_id = $1 AND used_at IS NULL`,
        [user.id]
      );
      await query(
        `INSERT INTO password_reset_requests (user_type, user_id, token_hash, expires_at)
         VALUES ('user', $1, $2, NOW() + INTERVAL '1 hour')`,
        [user.id, tokenHash]
      );
      await sendPasswordResetEmail({ toEmail: user.email, resetUrl, name: user.name });
    }
  } catch (_err) {
    // Silently absorb errors to prevent enumeration.
  }

  return okResponse();
});

router.get('/reset-password', async (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const token = String(req.query.token || '').trim();
  if (!/^[a-f0-9]{40,128}$/i.test(token)) {
    flash(req, 'error', 'Reset link is invalid. Request a new one.');
    return res.redirect('/forgot-password');
  }
  const tokenHash = hashToken(token);
  const reqRow = await query(
    `SELECT id FROM password_reset_requests
     WHERE token_hash = $1 AND user_type = 'user' AND used_at IS NULL AND expires_at >= NOW()`,
    [tokenHash]
  );
  if (reqRow.rowCount === 0) {
    flash(req, 'error', 'Reset link is invalid or has expired. Request a new one.');
    return res.redirect('/forgot-password');
  }
  res.render('reset_password', { title: 'Reset password', token, errorMessage: null });
});

router.post('/reset-password', async (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirm_password || '');

  const renderError = (msg) => res.status(400).render('reset_password', {
    title: 'Reset password', token, errorMessage: msg,
  });

  if (!/^[a-f0-9]{40,128}$/i.test(token)) return renderError('Invalid reset token.');
  if (password.length < 8) return renderError('Password must be at least 8 characters.');
  if (password !== confirmPassword) return renderError('Passwords do not match.');

  const tokenHash = hashToken(token);
  const reqRow = await query(
    `SELECT id, user_id FROM password_reset_requests
     WHERE token_hash = $1 AND user_type = 'user' AND used_at IS NULL AND expires_at >= NOW()`,
    [tokenHash]
  );
  if (reqRow.rowCount === 0) {
    flash(req, 'error', 'Reset link is invalid or has expired. Request a new one.');
    return res.redirect('/forgot-password');
  }

  const { id: resetId, user_id: userId } = reqRow.rows[0];
  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
  await query('UPDATE password_reset_requests SET used_at = NOW() WHERE id = $1', [resetId]);

  flash(req, 'success', 'Password updated. You can now log in.');
  return res.redirect('/login');
});

export default router;
