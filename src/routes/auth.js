import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { flash } from '../middleware.js';
import { generateReferralCode } from '../points.js';
import {
  checkEmailVerificationCode,
  maskEmail,
  normalizeEmail,
  sendEmailVerificationCode,
} from '../phone-verification.js';

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

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const ref = normalizeRefCode(req.query.ref);
  res.render('register', { title: 'Register', form: { ref } });
});

router.get('/register/verify', (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const pendingSignup = getPendingSignup(req);
  if (!pendingSignup) {
    flash(req, 'error', 'Start signup first so we can send your verification code.');
    return res.redirect('/register');
  }

  return res.render('register_verify', {
    title: 'Verify your email',
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

  if (!name || !email || !password) {
    flash(req, 'error', 'Name, email and password are required.');
    return res.status(400).render('register', { title: 'Register', form });
  }
  if (password.length < 8) {
    flash(req, 'error', 'Password must be at least 8 characters.');
    return res.status(400).render('register', { title: 'Register', form });
  }
  if (accept_tos !== 'on') {
    flash(req, 'error', 'You must accept the Terms of Service to create an account.');
    return res.status(400).render('register', { title: 'Register', form });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    flash(req, 'error', 'Enter a valid email address.');
    return res.status(400).render('register', { title: 'Register', form });
  }
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rowCount > 0) {
    flash(req, 'error', 'An account with that email already exists.');
    return res.status(409).render('register', { title: 'Register', form });
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
    flash(req, 'error', 'Partner name is required for doubles team registration.');
    return res.status(400).render('register', { title: 'Register', form });
  }

  const teamPreferredFormat = isTeamMode && safePreferredFormat === 'singles' ? 'doubles' : safePreferredFormat;

  const refCode = normalizeRefCode(ref);

  const pendingSignup = {
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: hash,
    city: city?.trim() || null,
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
    await sendEmailVerificationCode(normalizedEmail);
  } catch (err) {
    if (err && err.message === 'twilio_not_configured') {
      flash(req, 'error', 'Email verification is not configured. Set Twilio Verify credentials and enable email channel.');
    } else {
      flash(req, 'error', 'Could not send email verification code. Please try again.');
    }
    return res.status(502).render('register', { title: 'Register', form });
  }

  req.session.pendingSignup = pendingSignup;
  flash(req, 'success', `We sent a verification code to ${maskEmail(normalizedEmail)}.`);
  return res.redirect('/register/verify');
});

router.post('/register/verify/resend', async (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const pendingSignup = getPendingSignup(req);
  if (!pendingSignup) {
    flash(req, 'error', 'Start signup first so we can send your verification code.');
    return res.redirect('/register');
  }

  try {
    await sendEmailVerificationCode(pendingSignup.email);
    pendingSignup.requestedAt = Date.now();
    req.session.pendingSignup = pendingSignup;
    flash(req, 'success', `A new verification code was sent to ${maskEmail(pendingSignup.email)}.`);
  } catch (err) {
    if (err && err.message === 'twilio_not_configured') {
      flash(req, 'error', 'Email verification is not configured. Set Twilio Verify credentials and enable email channel.');
    } else {
      flash(req, 'error', 'Could not resend verification code. Please try again.');
    }
  }

  return res.redirect('/register/verify');
});

router.post('/register/verify', async (req, res) => {
  if (req.session.userId) return res.redirect('/challenges');
  const pendingSignup = getPendingSignup(req);
  if (!pendingSignup) {
    flash(req, 'error', 'Start signup first so we can verify your email.');
    return res.redirect('/register');
  }

  const code = String(req.body.verification_code || '').trim();
  if (!/^[A-Za-z0-9]{4,10}$/.test(code)) {
    flash(req, 'error', 'Enter a valid verification code.');
    return res.redirect('/register/verify');
  }

  try {
    const check = await checkEmailVerificationCode(pendingSignup.email, code);
    if (String(check.status) !== 'approved') {
      flash(req, 'error', 'Verification code is incorrect or expired.');
      return res.redirect('/register/verify');
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [pendingSignup.email]);
    if (existing.rowCount > 0) {
      req.session.pendingSignup = null;
      flash(req, 'error', 'An account with that email already exists. Please log in.');
      return res.redirect('/login');
    }

    const userId = await createUserFromPendingSignup(pendingSignup);
    req.session.pendingSignup = null;
    req.session.userId = userId;
    flash(req, 'success', `Welcome to TopMinton, ${pendingSignup.name}!`);
    return res.redirect('/challenges');
  } catch (err) {
    if (err && err.message === 'twilio_not_configured') {
      flash(req, 'error', 'Email verification is not configured. Set Twilio Verify credentials and enable email channel.');
    } else {
      flash(req, 'error', 'Could not verify code. Please try again.');
    }
    return res.redirect('/register/verify');
  }
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

export default router;
