import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, query } from '../db.js';
import { flash, requireAdminAuth } from '../middleware.js';
import { sendPasswordResetEmail } from '../email-verification.js';

export function createAdminRouter(deps = {}) {
  const {
    pool: dbPool = pool,
    query: runQuery = query,
    flash: flashFn = flash,
    requireAdminAuthMiddleware = requireAdminAuth,
    bcryptLib = bcrypt,
  } = deps;

  const router = express.Router();

  router.get('/admin/login', (req, res) => {
    if (req.session.adminId) return res.redirect('/admin');
    res.render('admin_login', { title: 'Admin Login', form: {} });
  });

  router.post('/admin/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const result = await runQuery(
      'SELECT id, name, email, password_hash, is_active FROM admins WHERE email = $1',
      [email]
    );
    const admin = result.rows[0];
    const ok = admin ? await bcryptLib.compare(password, admin.password_hash) : false;

    if (!ok) {
      flashFn(req, 'error', 'Invalid admin credentials.');
      return res.status(401).render('admin_login', { title: 'Admin Login', form: { email } });
    }
    if (!admin.is_active) {
      flashFn(req, 'error', 'This admin account is disabled.');
      return res.status(403).render('admin_login', { title: 'Admin Login', form: { email } });
    }

    req.session.adminId = admin.id;
    flashFn(req, 'success', `Welcome back, ${admin.name}.`);
    return res.redirect('/admin');
  });

  router.post('/admin/logout', (req, res) => {
    req.session.adminId = null;
    req.session.save(() => {
      res.redirect('/admin/login');
    });
  });

  router.get('/admin', requireAdminAuthMiddleware, async (_req, res) => {
    const badges = (await runQuery(
      `SELECT b.*,
              a.name AS created_by_name,
              (SELECT COUNT(*)::int FROM user_badges ub WHERE ub.badge_id = b.id) AS awarded_count
       FROM badges b
       LEFT JOIN admins a ON a.id = b.created_by_admin_id
       ORDER BY b.created_at DESC`
    )).rows;

    const admins = (await runQuery(
      `SELECT id, name, email, is_active, created_at
       FROM admins
       ORDER BY created_at DESC`
    )).rows;

    const badgeApplications = (await runQuery(
      `SELECT ba.id, ba.status, ba.note, ba.created_at,
              u.id AS user_id, u.name AS user_name,
              b.id AS badge_id, b.name AS badge_name, b.slug AS badge_slug
       FROM badge_applications ba
       JOIN users u ON u.id = ba.user_id
       JOIN badges b ON b.id = ba.badge_id
       WHERE ba.status = 'pending'
       ORDER BY ba.created_at ASC`
    )).rows;

    const badgeApplicationHistory = (await runQuery(
      `SELECT ba.id, ba.status, ba.note, ba.created_at, ba.reviewed_at,
              u.id AS user_id, u.name AS user_name,
              b.id AS badge_id, b.name AS badge_name, b.slug AS badge_slug,
              a.name AS reviewer_name
       FROM badge_applications ba
       JOIN users u ON u.id = ba.user_id
       JOIN badges b ON b.id = ba.badge_id
       LEFT JOIN admins a ON a.id = ba.reviewed_by_admin_id
       WHERE ba.status IN ('approved', 'rejected')
       ORDER BY ba.reviewed_at DESC NULLS LAST, ba.created_at DESC`
    )).rows;

    const pendingWallAppeals = (await runQuery(
      `SELECT wsa.id, wsa.reason, wsa.created_at,
              u.id AS user_id, u.name AS user_name,
              COALESCE(f.no_show_count, 0) AS no_show_count,
              COALESCE(f.non_payment_count, 0) AS non_payment_count,
              COALESCE(c.cancellations_30d, 0) AS cancellations_30d
       FROM wall_of_shame_appeals wsa
       JOIN users u ON u.id = wsa.user_id
       LEFT JOIN (
         SELECT to_user_id,
                SUM(CASE WHEN reported_no_show THEN 1 ELSE 0 END)::int AS no_show_count,
                SUM(CASE WHEN reported_non_payment THEN 1 ELSE 0 END)::int AS non_payment_count
         FROM challenge_feedback
         WHERE created_at >= NOW() - INTERVAL '90 days'
         GROUP BY to_user_id
       ) f ON f.to_user_id = wsa.user_id
       LEFT JOIN (
         SELECT challenger_id AS user_id,
                COUNT(*)::int AS cancellations_30d
         FROM challenges
         WHERE status = 'cancelled'
           AND updated_at >= NOW() - INTERVAL '30 days'
         GROUP BY challenger_id
       ) c ON c.user_id = wsa.user_id
       WHERE wsa.status = 'pending'
       ORDER BY wsa.created_at ASC`
    )).rows;

    const players = (await runQuery(
      `SELECT u.id, u.name, u.email, u.city, u.skill_rating, u.is_active, u.created_at,
              COALESCE(f.no_show_count, 0) AS no_show_count,
              COALESCE(f.non_payment_count, 0) AS non_payment_count
       FROM users u
       LEFT JOIN (
         SELECT to_user_id,
                SUM(CASE WHEN reported_no_show THEN 1 ELSE 0 END)::int AS no_show_count,
                SUM(CASE WHEN reported_non_payment THEN 1 ELSE 0 END)::int AS non_payment_count
         FROM challenge_feedback
         WHERE created_at >= NOW() - INTERVAL '90 days'
         GROUP BY to_user_id
       ) f ON f.to_user_id = u.id
       ORDER BY u.is_active ASC, u.created_at DESC
       LIMIT 200`
    )).rows;

    res.render('admin_dashboard', {
      title: 'Admin Dashboard',
      badges,
      admins,
      badgeApplications,
      badgeApplicationHistory,
      pendingWallAppeals,
      players,
      criteriaOptions: ['matches_played', 'wins', 'undefeated'],
    });
  });

  router.post('/admin/players/:id/ban', requireAdminAuthMiddleware, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      flashFn(req, 'error', 'Invalid player id.');
      return res.redirect('/admin');
    }
    const r = await runQuery(
      `UPDATE users SET is_active = FALSE WHERE id = $1 AND is_active = TRUE RETURNING id, name`,
      [userId]
    );
    if (r.rowCount === 0) {
      flashFn(req, 'error', 'Player not found or already banned.');
    } else {
      flashFn(req, 'success', `Player "${r.rows[0].name}" has been banned.`);
    }
    return res.redirect('/admin');
  });

  router.post('/admin/players/:id/unban', requireAdminAuthMiddleware, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      flashFn(req, 'error', 'Invalid player id.');
      return res.redirect('/admin');
    }
    const r = await runQuery(
      `UPDATE users SET is_active = TRUE WHERE id = $1 AND is_active = FALSE RETURNING id, name`,
      [userId]
    );
    if (r.rowCount === 0) {
      flashFn(req, 'error', 'Player not found or already active.');
    } else {
      flashFn(req, 'success', `Player "${r.rows[0].name}" has been reinstated.`);
    }
    return res.redirect('/admin');
  });

  router.post('/admin/players/:id/delete', requireAdminAuthMiddleware, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      flashFn(req, 'error', 'Invalid player id.');
      return res.redirect('/admin');
    }
    try {
      const r = await runQuery(`DELETE FROM users WHERE id = $1 RETURNING id, name`, [userId]);
      if (r.rowCount === 0) {
        flashFn(req, 'error', 'Player not found.');
      } else {
        flashFn(req, 'success', `Player "${r.rows[0].name}" has been removed.`);
      }
    } catch (_err) {
      flashFn(req, 'error', 'Could not remove player.');
    }
    return res.redirect('/admin');
  });

  router.post('/admin/wall-appeals/:id/approve', requireAdminAuthMiddleware, async (req, res) => {
    const appealId = Number(req.params.id);
    const reviewedNote = String(req.body.reviewed_note || '').trim() || null;
    if (!Number.isInteger(appealId)) {
      flashFn(req, 'error', 'Invalid appeal id.');
      return res.redirect('/admin');
    }

    const result = await runQuery(
      `UPDATE wall_of_shame_appeals
       SET status = 'approved',
           reviewed_by_admin_id = $1,
           reviewed_note = $2,
           reviewed_at = NOW(),
           valid_until = NOW() + INTERVAL '30 days'
       WHERE id = $3
         AND status = 'pending'`,
      [req.session.adminId, reviewedNote, appealId]
    );

    if (result.rowCount === 0) {
      flashFn(req, 'error', 'Could not approve appeal.');
    } else {
      flashFn(req, 'success', 'Appeal approved. Entry hidden for 30 days.');
    }
    return res.redirect('/admin');
  });

  router.post('/admin/wall-appeals/:id/reject', requireAdminAuthMiddleware, async (req, res) => {
    const appealId = Number(req.params.id);
    const reviewedNote = String(req.body.reviewed_note || '').trim() || null;
    if (!Number.isInteger(appealId)) {
      flashFn(req, 'error', 'Invalid appeal id.');
      return res.redirect('/admin');
    }

    const result = await runQuery(
      `UPDATE wall_of_shame_appeals
       SET status = 'rejected',
           reviewed_by_admin_id = $1,
           reviewed_note = $2,
           reviewed_at = NOW(),
           valid_until = NULL
       WHERE id = $3
         AND status = 'pending'`,
      [req.session.adminId, reviewedNote, appealId]
    );

    if (result.rowCount === 0) {
      flashFn(req, 'error', 'Could not reject appeal.');
    } else {
      flashFn(req, 'success', 'Appeal rejected.');
    }
    return res.redirect('/admin');
  });

  router.post('/admin/badge-applications/:id/approve', requireAdminAuthMiddleware, async (req, res) => {
    const applicationId = Number(req.params.id);
    if (!Number.isInteger(applicationId)) {
      flashFn(req, 'error', 'Invalid badge application id.');
      return res.redirect('/admin');
    }

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const appRes = await client.query(
        `SELECT *
         FROM badge_applications
         WHERE id = $1
         FOR UPDATE`,
        [applicationId]
      );
      const app = appRes.rows[0];
      if (!app || app.status !== 'pending') {
        throw new Error('not_pending');
      }

      await client.query(
        `INSERT INTO user_badges (user_id, badge_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, badge_id) DO NOTHING`,
        [app.user_id, app.badge_id]
      );

      await client.query(
        `UPDATE badge_applications
         SET status = 'approved',
             reviewed_by_admin_id = $1,
             reviewed_at = NOW()
         WHERE id = $2`,
        [req.session.adminId, applicationId]
      );

      await client.query('COMMIT');
      flashFn(req, 'success', 'Badge application approved.');
    } catch (_err) {
      await client.query('ROLLBACK');
      flashFn(req, 'error', 'Could not approve badge application.');
    } finally {
      client.release();
    }

    return res.redirect('/admin');
  });

  router.post('/admin/badge-applications/:id/reject', requireAdminAuthMiddleware, async (req, res) => {
    const applicationId = Number(req.params.id);
    if (!Number.isInteger(applicationId)) {
      flashFn(req, 'error', 'Invalid badge application id.');
      return res.redirect('/admin');
    }

    const result = await runQuery(
      `UPDATE badge_applications
       SET status = 'rejected',
           reviewed_by_admin_id = $1,
           reviewed_at = NOW()
       WHERE id = $2
         AND status = 'pending'`,
      [req.session.adminId, applicationId]
    );

    if (result.rowCount === 0) {
      flashFn(req, 'error', 'Could not reject badge application.');
    } else {
      flashFn(req, 'success', 'Badge application rejected.');
    }

    return res.redirect('/admin');
  });

  router.post('/admin/badges', requireAdminAuthMiddleware, async (req, res) => {
    const name = String(req.body.name || '').trim();
    const slug = String(req.body.slug || '').trim().toLowerCase();
    const description = String(req.body.description || '').trim() || null;
    const criteriaType = String(req.body.criteria_type || '').trim();
    const threshold = Number.parseInt(req.body.threshold, 10);

    if (!name || !slug) {
      flashFn(req, 'error', 'Badge name and slug are required.');
      return res.redirect('/admin');
    }
    if (!['matches_played', 'wins', 'undefeated'].includes(criteriaType)) {
      flashFn(req, 'error', 'Invalid badge criteria type.');
      return res.redirect('/admin');
    }
    if (!Number.isInteger(threshold) || threshold < 1) {
      flashFn(req, 'error', 'Threshold must be a positive integer.');
      return res.redirect('/admin');
    }

    try {
      await runQuery(
        `INSERT INTO badges (name, slug, description, criteria_type, threshold, created_by_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [name, slug, description, criteriaType, threshold, req.session.adminId]
      );
      flashFn(req, 'success', 'Badge created successfully.');
    } catch (err) {
      flashFn(req, 'error', 'Could not create badge. Slug must be unique.');
    }

    return res.redirect('/admin');
  });

  router.post('/admin/badges/:id/toggle', requireAdminAuthMiddleware, async (req, res) => {
    const badgeId = Number(req.params.id);
    if (!Number.isInteger(badgeId)) {
      flashFn(req, 'error', 'Invalid badge id.');
      return res.redirect('/admin');
    }

    const result = await runQuery(
      `UPDATE badges
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING is_active`,
      [badgeId]
    );

    if (result.rowCount === 0) {
      flashFn(req, 'error', 'Badge not found.');
      return res.redirect('/admin');
    }

    flashFn(req, 'success', `Badge ${result.rows[0].is_active ? 'activated' : 'deactivated'}.`);
    return res.redirect('/admin');
  });

  router.get('/admin/badges/:id/edit', requireAdminAuthMiddleware, async (req, res) => {
    const badgeId = Number(req.params.id);
    if (!Number.isInteger(badgeId)) {
      flashFn(req, 'error', 'Invalid badge id.');
      return res.redirect('/admin');
    }

    const result = await runQuery('SELECT * FROM badges WHERE id = $1', [badgeId]);
    const badge = result.rows[0];
    if (!badge) {
      flashFn(req, 'error', 'Badge not found.');
      return res.redirect('/admin');
    }

    return res.render('admin_badge_edit', {
      title: `Edit Badge: ${badge.name}`,
      badge,
      criteriaOptions: ['matches_played', 'wins', 'undefeated'],
    });
  });

  router.post('/admin/badges/:id/edit', requireAdminAuthMiddleware, async (req, res) => {
    const badgeId = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const slug = String(req.body.slug || '').trim().toLowerCase();
    const description = String(req.body.description || '').trim() || null;
    const criteriaType = String(req.body.criteria_type || '').trim();
    const threshold = Number.parseInt(req.body.threshold, 10);

    if (!Number.isInteger(badgeId)) {
      flashFn(req, 'error', 'Invalid badge id.');
      return res.redirect('/admin');
    }
    if (!name || !slug) {
      flashFn(req, 'error', 'Badge name and slug are required.');
      return res.redirect(`/admin/badges/${badgeId}/edit`);
    }
    if (!['matches_played', 'wins', 'undefeated'].includes(criteriaType)) {
      flashFn(req, 'error', 'Invalid badge criteria type.');
      return res.redirect(`/admin/badges/${badgeId}/edit`);
    }
    if (!Number.isInteger(threshold) || threshold < 1) {
      flashFn(req, 'error', 'Threshold must be a positive integer.');
      return res.redirect(`/admin/badges/${badgeId}/edit`);
    }

    try {
      const result = await runQuery(
        `UPDATE badges
         SET name = $1,
             slug = $2,
             description = $3,
             criteria_type = $4,
             threshold = $5
         WHERE id = $6`,
        [name, slug, description, criteriaType, threshold, badgeId]
      );

      if (result.rowCount === 0) {
        flashFn(req, 'error', 'Badge not found.');
        return res.redirect('/admin');
      }

      flashFn(req, 'success', 'Badge updated successfully.');
      return res.redirect('/admin');
    } catch (_err) {
      flashFn(req, 'error', 'Could not update badge. Slug must be unique.');
      return res.redirect(`/admin/badges/${badgeId}/edit`);
    }
  });

  router.post('/admin/admins', requireAdminAuthMiddleware, async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirm_password || '');
    const currentAdminPassword = String(req.body.current_admin_password || '');

    if (!name || !email || !password || !confirmPassword || !currentAdminPassword) {
      flashFn(req, 'error', 'All admin creation fields are required.');
      return res.redirect('/admin');
    }
    if (password.length < 8) {
      flashFn(req, 'error', 'New admin password must be at least 8 characters.');
      return res.redirect('/admin');
    }
    if (password !== confirmPassword) {
      flashFn(req, 'error', 'New admin password and confirmation do not match.');
      return res.redirect('/admin');
    }

    const currentAdminRes = await runQuery(
      'SELECT password_hash FROM admins WHERE id = $1',
      [req.session.adminId]
    );
    const currentAdmin = currentAdminRes.rows[0];
    const currentAdminVerified = currentAdmin
      ? await bcryptLib.compare(currentAdminPassword, currentAdmin.password_hash)
      : false;

    if (!currentAdminVerified) {
      flashFn(req, 'error', 'Current admin password is incorrect.');
      return res.redirect('/admin');
    }

    const existing = await runQuery('SELECT id FROM admins WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      flashFn(req, 'error', 'An admin with that email already exists.');
      return res.redirect('/admin');
    }

    const passwordHash = await bcryptLib.hash(password, 12);
    await runQuery(
      `INSERT INTO admins (name, email, password_hash)
       VALUES ($1, $2, $3)`,
      [name, email, passwordHash]
    );

    flashFn(req, 'success', 'New admin created successfully.');
    return res.redirect('/admin');
  });

  router.post('/admin/admins/:id/toggle', requireAdminAuthMiddleware, async (req, res) => {
    const adminId = Number(req.params.id);
    if (!Number.isInteger(adminId)) {
      flashFn(req, 'error', 'Invalid admin id.');
      return res.redirect('/admin');
    }

    const targetRes = await runQuery('SELECT id, is_active FROM admins WHERE id = $1', [adminId]);
    const target = targetRes.rows[0];
    if (!target) {
      flashFn(req, 'error', 'Admin not found.');
      return res.redirect('/admin');
    }
    if (target.id === req.session.adminId) {
      flashFn(req, 'error', 'You cannot disable your own admin account.');
      return res.redirect('/admin');
    }

    if (target.is_active) {
      const activeCountRes = await runQuery('SELECT COUNT(*)::int AS count FROM admins WHERE is_active = TRUE');
      if ((activeCountRes.rows[0]?.count || 0) <= 1) {
        flashFn(req, 'error', 'Cannot disable the last active admin account.');
        return res.redirect('/admin');
      }
    }

    const updated = await runQuery(
      `UPDATE admins
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING is_active`,
      [adminId]
    );

    flashFn(req, 'success', `Admin ${updated.rows[0].is_active ? 'enabled' : 'disabled'}.`);
    return res.redirect('/admin');
  });

  router.post('/admin/admins/:id/delete', requireAdminAuthMiddleware, async (req, res) => {
    const adminId = Number(req.params.id);
    if (!Number.isInteger(adminId)) {
      flashFn(req, 'error', 'Invalid admin id.');
      return res.redirect('/admin');
    }
    if (adminId === req.session.adminId) {
      flashFn(req, 'error', 'You cannot delete your own admin account.');
      return res.redirect('/admin');
    }

    const targetRes = await runQuery('SELECT id, is_active FROM admins WHERE id = $1', [adminId]);
    const target = targetRes.rows[0];
    if (!target) {
      flashFn(req, 'error', 'Admin not found.');
      return res.redirect('/admin');
    }

    if (target.is_active) {
      const activeCountRes = await runQuery('SELECT COUNT(*)::int AS count FROM admins WHERE is_active = TRUE');
      if ((activeCountRes.rows[0]?.count || 0) <= 1) {
        flashFn(req, 'error', 'Cannot delete the last active admin account.');
        return res.redirect('/admin');
      }
    }

    await runQuery('DELETE FROM admins WHERE id = $1', [adminId]);
    flashFn(req, 'success', 'Admin account deleted.');
    return res.redirect('/admin');
  });

  return router;
}

function hashAdminToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function getBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

const router = createAdminRouter();

router.get('/admin/forgot-password', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin_forgot_password', { title: 'Admin — Forgot password', form: {}, errorMessage: null, successMessage: null });
});

router.post('/admin/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const okResponse = () => res.render('admin_forgot_password', {
    title: 'Admin — Forgot password',
    form: {},
    errorMessage: null,
    successMessage: 'If an admin account with that email exists, a reset link has been sent.',
  });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return okResponse();

  try {
    const adminRes = await query(
      'SELECT id, name, email FROM admins WHERE email = $1 AND is_active = TRUE',
      [email]
    );
    if (adminRes.rowCount > 0) {
      const admin = adminRes.rows[0];
      const token = randomBytes(32).toString('hex');
      const tokenHash = hashAdminToken(token);
      const resetUrl = `${getBaseUrl(req)}/admin/reset-password?token=${token}`;

      await query(
        `DELETE FROM password_reset_requests
         WHERE user_type = 'admin' AND user_id = $1 AND used_at IS NULL`,
        [admin.id]
      );
      await query(
        `INSERT INTO password_reset_requests (user_type, user_id, token_hash, expires_at)
         VALUES ('admin', $1, $2, NOW() + INTERVAL '1 hour')`,
        [admin.id, tokenHash]
      );
      await sendPasswordResetEmail({ toEmail: admin.email, resetUrl, name: admin.name, isAdmin: true });
    }
  } catch (_err) {
    // Silently absorb to prevent enumeration.
  }

  return okResponse();
});

router.get('/admin/reset-password', async (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  const token = String(req.query.token || '').trim();
  if (!/^[a-f0-9]{40,128}$/i.test(token)) {
    flash(req, 'error', 'Reset link is invalid. Request a new one.');
    return res.redirect('/admin/forgot-password');
  }
  const tokenHash = hashAdminToken(token);
  const reqRow = await query(
    `SELECT id FROM password_reset_requests
     WHERE token_hash = $1 AND user_type = 'admin' AND used_at IS NULL AND expires_at >= NOW()`,
    [tokenHash]
  );
  if (reqRow.rowCount === 0) {
    flash(req, 'error', 'Reset link is invalid or has expired. Request a new one.');
    return res.redirect('/admin/forgot-password');
  }
  res.render('admin_reset_password', { title: 'Admin — Reset password', token, errorMessage: null });
});

router.post('/admin/reset-password', async (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  const token = String(req.body.token || '').trim();
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirm_password || '');

  const renderError = (msg) => res.status(400).render('admin_reset_password', {
    title: 'Admin — Reset password', token, errorMessage: msg,
  });

  if (!/^[a-f0-9]{40,128}$/i.test(token)) return renderError('Invalid reset token.');
  if (password.length < 8) return renderError('Password must be at least 8 characters.');
  if (password !== confirmPassword) return renderError('Passwords do not match.');

  const tokenHash = hashAdminToken(token);
  const reqRow = await query(
    `SELECT id, user_id FROM password_reset_requests
     WHERE token_hash = $1 AND user_type = 'admin' AND used_at IS NULL AND expires_at >= NOW()`,
    [tokenHash]
  );
  if (reqRow.rowCount === 0) {
    flash(req, 'error', 'Reset link is invalid or has expired. Request a new one.');
    return res.redirect('/admin/forgot-password');
  }

  const { id: resetId, user_id: adminId } = reqRow.rows[0];
  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hash, adminId]);
  await query('UPDATE password_reset_requests SET used_at = NOW() WHERE id = $1', [resetId]);

  flash(req, 'success', 'Admin password updated. You can now log in.');
  return res.redirect('/admin/login');
});

export default router;
