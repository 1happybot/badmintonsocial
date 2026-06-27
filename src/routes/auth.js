import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { flash } from '../middleware.js';
import { generateReferralCode } from '../points.js';

const router = express.Router();

function normalizeRefCode(value) {
  return String(value || '').trim().toUpperCase().slice(0, 16) || null;
}

router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/players');
  const ref = normalizeRefCode(req.query.ref);
  res.render('register', { title: 'Register', form: { ref } });
});

router.post('/register', async (req, res) => {
  const {
    name,
    email,
    password,
    city,
    skill_rating,
    shuttle_preference,
    bio,
    avatar_style,
    handedness,
    preferred_format,
    interested_in_tournaments,
    club_player,
    team_mode,
    partner_name,
    partner_handedness,
    partner_skill_rating,
    ref,
  } = req.body;
  const form = {
    name,
    email,
    city,
    skill_rating,
    shuttle_preference,
    bio,
    avatar_style,
    handedness,
    preferred_format,
    interested_in_tournaments,
    club_player,
    team_mode,
    partner_name,
    partner_handedness,
    partner_skill_rating,
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

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rowCount > 0) {
    flash(req, 'error', 'An account with that email already exists.');
    return res.status(409).render('register', { title: 'Register', form });
  }

  const hash = await bcrypt.hash(password, 12);
  const rating = Number.parseInt(skill_rating, 10);
  const safeRating = Number.isInteger(rating) && rating >= 1 && rating <= 10 ? rating : 5;
  const safePref = ['feathers', 'plastics', 'both'].includes(shuttle_preference) ? shuttle_preference : 'both';
  const safeAvatarStyle = ['smash', 'lightning', 'shield', 'fire', 'ice', 'comet', 'rocket', 'crown'].includes(String(avatar_style || ''))
    ? String(avatar_style)
    : 'smash';
  const safeHandedness = ['right', 'left', 'ambidextrous'].includes(String(handedness || ''))
    ? String(handedness)
    : 'right';
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

  let referrerId = null;
  const refCode = normalizeRefCode(ref);
  if (refCode) {
    const refRes = await query(
      'SELECT id FROM users WHERE referral_code = $1 AND is_active = TRUE',
      [refCode]
    );
    if (refRes.rowCount > 0) {
      referrerId = refRes.rows[0].id;
    }
  }

  let newReferralCode = generateReferralCode();
  for (let i = 0; i < 5; i += 1) {
    const clash = await query('SELECT 1 FROM users WHERE referral_code = $1', [newReferralCode]);
    if (clash.rowCount === 0) break;
    newReferralCode = generateReferralCode();
  }

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
      name.trim(),
      normalizedEmail,
      hash,
      city?.trim() || null,
      'Sweden',
      safeRating,
      safePref,
      bio?.trim() || null,
      safeAvatarStyle,
      safeHandedness,
      teamPreferredFormat,
      interested_in_tournaments === 'on',
      club_player === 'on',
      isTeamMode,
      safePartnerName,
      safePartnerHandedness,
      safePartnerRating,
      newReferralCode,
      referrerId,
    ]
  );

  req.session.userId = inserted.rows[0].id;
  flash(req, 'success', `Welcome to TopMinton, ${name.trim()}!`);
  res.redirect('/players');
});

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/players');
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
  res.redirect('/players');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

export default router;
