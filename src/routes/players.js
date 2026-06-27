import express from 'express';
import { query } from '../db.js';
import { flash, requireAuth } from '../middleware.js';

export function createPlayerRouter(deps = {}) {
  const {
    query: runQuery = query,
    requireAuthMiddleware = requireAuth,
  } = deps;

  const router = express.Router();

  router.get('/players', requireAuthMiddleware, async (req, res) => {
    const { city, min_rating, max_rating } = req.query;
    const filters = ['id <> $1'];
    const params = [req.session.userId];

    if (city) {
      params.push(`%${city.toLowerCase()}%`);
      filters.push(`LOWER(city) LIKE $${params.length}`);
    }
    const minRating = Number.parseInt(min_rating, 10);
    if (Number.isInteger(minRating) && minRating >= 1 && minRating <= 10) {
      params.push(minRating);
      filters.push(`skill_rating >= $${params.length}`);
    }

    const maxRating = Number.parseInt(max_rating, 10);
    if (Number.isInteger(maxRating) && maxRating >= 1 && maxRating <= 10) {
      params.push(maxRating);
      filters.push(`skill_rating <= $${params.length}`);
    }

    const sql = `
      SELECT id, name, city, skill_rating, avatar_style, preferred_format, team_mode
      FROM users
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 200
    `;
    const players = (await runQuery(sql, params)).rows;
    res.render('players', {
      title: 'Players',
      players,
      filters: { city: city || '', min_rating: min_rating || '', max_rating: max_rating || '' },
    });
  });

  router.get('/players/:id', requireAuthMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

    const userRes = await runQuery(
      `SELECT u.id, u.name, u.city, u.skill_rating, u.bio, u.created_at,
              u.avatar_style, u.handedness, u.preferred_format, u.shuttle_preference,
              u.interested_in_tournaments, u.club_player, u.team_mode,
              u.partner_name, u.partner_handedness, u.partner_skill_rating,
              u.topminton_points, u.referral_code,
              COALESCE((SELECT ROUND(AVG(cf.rating)::numeric, 1) FROM challenge_feedback cf WHERE cf.to_user_id = u.id), 0) AS avg_feedback_rating,
              COALESCE((SELECT COUNT(*)::int FROM challenge_feedback cf WHERE cf.to_user_id = u.id), 0) AS feedback_count
       FROM users u
       WHERE u.id = $1`,
      [id]
    );
    const player = userRes.rows[0];
    if (!player) return res.status(404).render('not_found', { title: 'Not found' });

    const recent = (await runQuery(
      `SELECT c.*, u1.name AS challenger_name, u2.name AS opponent_name
       FROM challenges c
       JOIN users u1 ON u1.id = c.challenger_id
       JOIN users u2 ON u2.id = c.opponent_id
       WHERE (c.challenger_id = $1 OR c.opponent_id = $1)
         AND c.status IN ('accepted','completed')
       ORDER BY c.proposed_at DESC
       LIMIT 10`,
      [id]
    )).rows;

    const badges = (await runQuery(
      `SELECT b.name, b.slug, b.description, ub.awarded_at
       FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = $1
       ORDER BY ub.awarded_at DESC`,
      [id]
    )).rows;

    let badgeApplications = [];
    let availableBadges = [];
    let referralStats = null;
    if (req.session.userId === id) {
      badgeApplications = (await runQuery(
        `SELECT ba.id, ba.status, ba.note, ba.created_at, b.id AS badge_id, b.name, b.slug, b.description
         FROM badge_applications ba
         JOIN badges b ON b.id = ba.badge_id
         WHERE ba.user_id = $1
         ORDER BY ba.created_at DESC`,
        [id]
      )).rows;

      availableBadges = (await runQuery(
        `SELECT b.id, b.name, b.slug, b.description
         FROM badges b
         WHERE b.is_active = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM user_badges ub
             WHERE ub.user_id = $1 AND ub.badge_id = b.id
           )
         ORDER BY b.created_at DESC`,
        [id]
      )).rows;

      const referredRes = await runQuery(
        `SELECT u.id, u.name, u.created_at,
                COALESCE(att.attended_count, 0) AS attended_count
         FROM users u
         LEFT JOIN (
           SELECT user_id, COUNT(*)::int AS attended_count
           FROM point_transactions
           WHERE reason = 'attended'
           GROUP BY user_id
         ) att ON att.user_id = u.id
         WHERE u.referred_by_user_id = $1
         ORDER BY u.created_at DESC
         LIMIT 50`,
        [id]
      );
      const earnedRes = await runQuery(
        `SELECT COALESCE(SUM(points), 0)::int AS total
         FROM point_transactions
         WHERE user_id = $1 AND source_type = 'referral'`,
        [id]
      );
      referralStats = {
        invited: referredRes.rows,
        invitedCount: referredRes.rowCount,
        rewardedCount: referredRes.rows.filter((r) => r.attended_count >= 5).length,
        pointsEarned: earnedRes.rows[0]?.total || 0,
      };
    }

    res.render('player_profile', {
      title: player.name,
      player,
      recent,
      badges,
      badgeApplications,
      availableBadges,
      referralStats,
    });
  });

  router.post('/players/:id/badges/apply', requireAuthMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    const badgeId = Number(req.body.badge_id);
    const note = String(req.body.note || '').trim() || null;

    if (!Number.isInteger(id) || id !== req.session.userId) {
      return res.status(403).send('Forbidden');
    }
    if (!Number.isInteger(badgeId)) {
      return res.status(400).send('Invalid badge.');
    }

    const badgeRes = await runQuery(
      `SELECT id
       FROM badges
       WHERE id = $1 AND is_active = TRUE`,
      [badgeId]
    );
    if (badgeRes.rowCount === 0) {
      return res.status(400).send('Badge not available.');
    }

    const alreadyAwarded = await runQuery(
      `SELECT 1
       FROM user_badges
       WHERE user_id = $1 AND badge_id = $2`,
      [id, badgeId]
    );
    if (alreadyAwarded.rowCount > 0) {
      return res.redirect(`/players/${id}`);
    }

    const pendingExists = await runQuery(
      `SELECT 1
       FROM badge_applications
       WHERE user_id = $1 AND badge_id = $2 AND status = 'pending'`,
      [id, badgeId]
    );
    if (pendingExists.rowCount > 0) {
      return res.redirect(`/players/${id}`);
    }

    await runQuery(
      `INSERT INTO badge_applications (user_id, badge_id, note)
       VALUES ($1, $2, $3)`,
      [id, badgeId, note]
    );

    return res.redirect(`/players/${id}`);
  });

  router.get('/players/:id/edit', requireAuthMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).send('Invalid id');
    if (req.session.userId !== id) return res.status(403).send('Forbidden');

    const playerRes = await runQuery(
      `SELECT id, name, city, skill_rating, bio, avatar_style, handedness, preferred_format,
              shuttle_preference, interested_in_tournaments, club_player, team_mode,
              partner_name, partner_handedness, partner_skill_rating
       FROM users
       WHERE id = $1`,
      [id]
    );
    const player = playerRes.rows[0];
    if (!player) return res.status(404).render('not_found', { title: 'Not found' });

    return res.render('player_edit', {
      title: 'Edit Profile',
      form: player,
    });
  });

  router.post('/players/:id/edit', requireAuthMiddleware, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).send('Invalid id');
    if (req.session.userId !== id) return res.status(403).send('Forbidden');

    const avatarStyle = ['smash', 'lightning', 'shield', 'fire', 'ice', 'comet', 'rocket', 'crown'].includes(String(req.body.avatar_style || ''))
      ? String(req.body.avatar_style)
      : 'smash';
    const handedness = ['right', 'left', 'ambidextrous'].includes(String(req.body.handedness || ''))
      ? String(req.body.handedness)
      : 'right';
    const preferredFormat = ['singles', 'doubles', 'both'].includes(String(req.body.preferred_format || ''))
      ? String(req.body.preferred_format)
      : 'singles';
    const shuttlePreference = ['feathers', 'plastics', 'both'].includes(String(req.body.shuttle_preference || ''))
      ? String(req.body.shuttle_preference)
      : 'both';
    const teamMode = req.body.team_mode === 'on';
    const partnerName = teamMode ? String(req.body.partner_name || '').trim() : null;
    const partnerHandedness = teamMode && ['right', 'left', 'ambidextrous'].includes(String(req.body.partner_handedness || ''))
      ? String(req.body.partner_handedness)
      : null;
    const partnerSkillRatingNum = Number.parseInt(req.body.partner_skill_rating, 10);
    const partnerSkillRating = teamMode && Number.isInteger(partnerSkillRatingNum) && partnerSkillRatingNum >= 1 && partnerSkillRatingNum <= 10
      ? partnerSkillRatingNum
      : null;
    const bio = String(req.body.bio || '').trim() || null;

    if (teamMode && !partnerName) {
      flash(req, 'error', 'Partner name is required when team mode is enabled.');
      return res.redirect(`/players/${id}/edit`);
    }

    const safePreferredFormat = teamMode && preferredFormat === 'singles' ? 'doubles' : preferredFormat;

    await runQuery(
      `UPDATE users
       SET avatar_style = $1,
           handedness = $2,
           preferred_format = $3,
           shuttle_preference = $4,
           interested_in_tournaments = $5,
           club_player = $6,
           team_mode = $7,
           partner_name = $8,
           partner_handedness = $9,
           partner_skill_rating = $10,
           bio = $11
       WHERE id = $12`,
      [
        avatarStyle,
        handedness,
        safePreferredFormat,
        shuttlePreference,
        req.body.interested_in_tournaments === 'on',
        req.body.club_player === 'on',
        teamMode,
        partnerName,
        partnerHandedness,
        partnerSkillRating,
        bio,
        id,
      ]
    );

    flash(req, 'success', 'Profile updated successfully.');
    return res.redirect(`/players/${id}`);
  });

  return router;
}

const router = createPlayerRouter();
export default router;
