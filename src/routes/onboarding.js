import express from 'express';
import { query } from '../db.js';
import { sendVerificationCode, checkVerificationCode } from '../phone-verification.js';

const router = express.Router();

const RESEND_COOLDOWN_MS = 60000; // 60 seconds
const CODE_TTL_MS = 600000; // 10 minutes
const REFERRAL_BONUS_POINTS = 100; // Bonus for new user
const REFERRER_BONUS_POINTS = 50; // Bonus for referrer

// Helper: getTwilioSmsErrorMessage (reuse from players.js)
function getTwilioSmsErrorMessage(err) {
  const code = err.code;
  if (code === 60200) return 'Invalid phone number. Make sure it includes country code (e.g., +46701234567).';
  if (code === 60202 || code === 60203) return 'Phone verification service temporarily unavailable. Please try again shortly.';
  if (code === 60212) return 'Too many verification requests from this number. Please wait before trying again.';
  if (code === 20003) return 'Invalid account credentials. Contact support.';
  if (code === 20404) return 'Verification service not available for this region.';
  return err.message || 'Failed to send verification code.';
}

function getTwilioCheckErrorMessage(err) {
  const code = err.code;
  if (code === 60202) return 'Too many verification attempts. Please wait 10 minutes before trying again.';
  if (code === 60200) return 'Invalid verification code. Please check and try again.';
  return err.message || 'Verification failed. Please try again.';
}

// GET /onboarding/welcome - Show welcome screen
router.get('/onboarding/welcome', async (req, res) => {
  if (!req.user) return res.redirect('/login');
  if (req.user.onboarding_completed_at) return res.redirect('/challenges');
  
  res.render('onboarding/welcome', {
    title: 'Welcome to TopMinton',
    userName: req.user.name,
    skillRating: req.user.skill_rating || 5,
  });
});

// POST /onboarding/welcome - Mark welcome viewed
router.post('/onboarding/welcome', async (req, res) => {
  if (!req.user) return res.redirect('/login');
  
  try {
    await query(
      'UPDATE users SET onboarding_step = $1 WHERE id = $2',
      ['phone', req.user.id]
    );
    res.redirect('/onboarding/phone');
  } catch (err) {
    console.error('[onboarding] welcome step failed:', err);
    res.status(500).render('error', { title: 'Error', error: 'Failed to update onboarding state' });
  }
});

// GET /onboarding/phone - Show phone verification screen
router.get('/onboarding/phone', async (req, res) => {
  if (!req.user) return res.redirect('/login');
  if (req.user.onboarding_completed_at) return res.redirect('/challenges');
  
  const isVerified = !!req.user.phone_verified_at;
  
  res.render('onboarding/phone', {
    title: 'Verify Your Phone',
    isVerified,
    phoneNumber: req.user.phone_number || '',
  });
});

// POST /onboarding/phone/send - Send verification code
router.post('/onboarding/phone/send', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  const { phone } = req.body;
  
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'Phone number is required' });
  }
  
  try {
    // Check cooldown
    const lastSent = req.session.lastPhoneSendTime || 0;
    if (Date.now() - lastSent < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSeconds} seconds before resending.` });
    }
    
    // Send verification code
    await sendVerificationCode(phone);
    
    // Store phone in session and update database
    req.session.verifyingPhoneNumber = phone;
    req.session.phoneVerificationStart = Date.now();
    req.session.lastPhoneSendTime = Date.now();
    
    await query('UPDATE users SET phone_number = $1 WHERE id = $2', [phone, req.user.id]);
    
    res.json({ success: true, message: 'Code sent! Check your SMS.' });
  } catch (err) {
    console.error('[onboarding] send code error:', err);
    const message = getTwilioSmsErrorMessage(err);
    res.status(400).json({ error: message });
  }
});

// POST /onboarding/phone/verify - Verify code
router.post('/onboarding/phone/verify', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  const { code } = req.body;
  const phone = req.session.verifyingPhoneNumber;
  
  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'Verification code is required' });
  }
  
  if (!phone) {
    return res.status(400).json({ error: 'Please send a code first' });
  }
  
  // Check TTL
  const verificationAge = Date.now() - (req.session.phoneVerificationStart || 0);
  if (verificationAge > CODE_TTL_MS) {
    return res.status(400).json({ error: 'Code expired. Please request a new one.' });
  }
  
  try {
    await checkVerificationCode(phone, code);
    
    // Mark as verified
    await query(
      'UPDATE users SET phone_verified_at = NOW() WHERE id = $1',
      [req.user.id]
    );
    
    // Clear session
    delete req.session.verifyingPhoneNumber;
    delete req.session.phoneVerificationStart;
    
    res.json({ success: true, message: 'Phone verified!' });
  } catch (err) {
    console.error('[onboarding] verify code error:', err);
    const message = getTwilioCheckErrorMessage(err);
    res.status(400).json({ error: message });
  }
});

// GET /onboarding/first-event - Choose first event action
router.get('/onboarding/first-event', async (req, res) => {
  if (!req.user) return res.redirect('/login');
  if (req.user.onboarding_completed_at) return res.redirect('/challenges');
  
  res.render('onboarding/first-event', {
    title: 'Your First Event',
    userName: req.user.name,
  });
});

// POST /onboarding/first-event/skip - Skip onboarding
router.post('/onboarding/first-event/skip', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  try {
    await query(
      `UPDATE users SET onboarding_completed_at = NOW(), onboarding_step = $1 
       WHERE id = $2`,
      ['completed', req.user.id]
    );
    res.json({ success: true, redirect: '/challenges' });
  } catch (err) {
    console.error('[onboarding] skip failed:', err);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// POST /onboarding/first-event/complete - Complete onboarding
router.post('/onboarding/first-event/complete', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  const { action, referral_code } = req.body; // 'host' or 'join'
  
  try {
    let referral_bonus = 0;
    let referrer_id = null;

    // Process referral code if provided
    if (referral_code && referral_code.trim()) {
      const referralCode = referral_code.trim().toUpperCase();
      
      // Find referrer by referral code
      const referrerResult = await query(
        'SELECT id FROM users WHERE referral_code = $1',
        [referralCode]
      );
      
      if (referrerResult.rows.length > 0) {
        referrer_id = referrerResult.rows[0].id;
        
        // Prevent self-referral
        if (referrer_id === req.user.id) {
          return res.status(400).json({ error: 'Cannot use your own referral code.' });
        }
        
        // Check if this referral already exists
        const existingRef = await query(
          'SELECT id FROM referral_bonuses WHERE referrer_id = $1 AND referee_id = $2',
          [referrer_id, req.user.id]
        );
        
        if (existingRef.rows.length === 0) {
          // Create referral bonus record
          await query(
            `INSERT INTO referral_bonuses 
             (referrer_id, referee_id, bonus_points, referrer_bonus_points, status) 
             VALUES ($1, $2, $3, $4, 'approved')`,
            [referrer_id, req.user.id, REFERRAL_BONUS_POINTS, REFERRER_BONUS_POINTS]
          );
          
          referral_bonus = REFERRAL_BONUS_POINTS;
        }
      }
    }
    
    // Complete onboarding and apply bonus
    await query(
      `UPDATE users SET 
        onboarding_completed_at = NOW(), 
        onboarding_step = $1,
        applied_referral_code = $2,
        referral_bonus_points = $3,
        referral_bonus_applied_at = CASE WHEN $3 > 0 THEN NOW() ELSE NULL END,
        topminton_points = topminton_points + $3
       WHERE id = $4`,
      ['completed', referrer_id ? (await query('SELECT referral_code FROM users WHERE id = $1', [referrer_id])).rows[0].referral_code : null, referral_bonus, req.user.id]
    );
    
    res.json({ success: true, redirect: '/hosted-matches', bonus_applied: referral_bonus });
  } catch (err) {
    console.error('[onboarding] complete failed:', err);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// POST /onboarding/skip - Skip entire onboarding
router.post('/onboarding/skip', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  try {
    await query(
      'UPDATE users SET onboarding_skipped_at = NOW() WHERE id = $1',
      [req.user.id]
    );
    res.json({ success: true, redirect: '/challenges' });
  } catch (err) {
    console.error('[onboarding] skip failed:', err);
    res.status(500).json({ error: 'Failed to skip onboarding' });
  }
});

export default router;
