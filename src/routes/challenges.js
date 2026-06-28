import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../db.js';
import { requireAuth, flash } from '../middleware.js';
import { grantEligibleBadges } from '../badges.js';
import { awardPoints, maybeRewardReferrer, POINTS_ATTEND, POINTS_HOST } from '../points.js';

const router = express.Router();
const MAX_PENDING_OUTGOING = 8;
const MAX_CREATED_LAST_HOUR = 10;
const MAX_CANCELLATIONS_30D = 6;
const HOSTED_ATTENDANCE_STATUSES = new Set(['undecided', 'attended', 'no_show']);
const HOSTED_PAYMENT_STATUSES = new Set(['undecided', 'paid', 'no_show']);
const HOSTED_SHUTTLE_TYPES = new Set(['feathers', 'plastics']);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadHostedLocations() {
  const fallback = [
    'Sollentuna Rackethall',
    'Kista Rackethall',
    'Komethallen',
    'Enskede Rackethall',
    'Frescati Racketcenter',
    'Sundbyberg Rackethall',
    'Skogas Rackethall',
    'BadmintonStadion Skanstul',
    'Other',
  ];
  try {
    const filePath = path.join(__dirname, '../../config/hosted-match-locations.yml');
    const content = fs.readFileSync(filePath, 'utf8');
    const items = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter(Boolean);
    if (items.length === 0) return fallback;
    if (!items.includes('Other')) items.push('Other');
    return items;
  } catch (_err) {
    return fallback;
  }
}

const HOSTED_LOCATIONS = loadHostedLocations();

async function getPolicyCounters(userId) {
  const pendingOutgoingRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM challenges
     WHERE challenger_id = $1
       AND status = 'pending'`,
    [userId]
  );
  const recentChallengeCreatesRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM challenges
     WHERE challenger_id = $1
       AND created_at >= NOW() - INTERVAL '1 hour'`,
    [userId]
  );
  const challengeCancelsRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM challenges
     WHERE challenger_id = $1
       AND status = 'cancelled'
       AND updated_at >= NOW() - INTERVAL '30 days'`,
    [userId]
  );
  const hostedCancelsRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM hosted_matches
     WHERE host_id = $1
       AND status = 'cancelled'
       AND updated_at >= NOW() - INTERVAL '30 days'`,
    [userId]
  );

  return {
    pendingOutgoing: pendingOutgoingRes.rows[0].count,
    createdLastHour: recentChallengeCreatesRes.rows[0].count,
    cancellations30d: challengeCancelsRes.rows[0].count + hostedCancelsRes.rows[0].count,
  };
}

async function enforcePolicyGuards(req, res, redirectTo) {
  const counters = await getPolicyCounters(req.session.userId);
  if (counters.pendingOutgoing >= MAX_PENDING_OUTGOING || counters.createdLastHour >= MAX_CREATED_LAST_HOUR) {
    flash(req, 'error', 'Challenge rate limit reached. Please wait before sending more challenges.');
    res.redirect(redirectTo);
    return false;
  }
  if (counters.cancellations30d >= MAX_CANCELLATIONS_30D) {
    flash(req, 'error', 'Account temporarily restricted due to repeated cancellations. Contact admins if this is wrong.');
    res.redirect(redirectTo);
    return false;
  }
  return true;
}

async function enforceVerifiedPhone(req, res, redirectTo) {
  const phoneRes = await query(
    `SELECT phone_verified_at
     FROM users
     WHERE id = $1`,
    [req.session.userId]
  );
  const row = phoneRes.rows[0];
  if (!row || !row.phone_verified_at) {
    flash(req, 'error', 'Verify your Swedish phone number in your profile before joining matches or challenges.');
    res.redirect(redirectTo);
    return false;
  }
  return true;
}

router.get('/challenges', requireAuth, async (req, res) => {
  const userId = req.session.userId;

  const incoming = (await query(
    `SELECT c.*, u.name AS challenger_name
     FROM challenges c JOIN users u ON u.id = c.challenger_id
     WHERE c.opponent_id = $1 AND c.status = 'pending'
     ORDER BY c.proposed_at ASC`,
    [userId]
  )).rows;

  const outgoing = (await query(
    `SELECT c.*, u.name AS opponent_name
     FROM challenges c JOIN users u ON u.id = c.opponent_id
     WHERE c.challenger_id = $1 AND c.status = 'pending'
     ORDER BY c.proposed_at ASC`,
    [userId]
  )).rows;

  const upcoming = (await query(
    `SELECT c.*, u1.name AS challenger_name, u2.name AS opponent_name
     FROM challenges c
     JOIN users u1 ON u1.id = c.challenger_id
     JOIN users u2 ON u2.id = c.opponent_id
     WHERE (c.challenger_id = $1 OR c.opponent_id = $1)
       AND c.status = 'accepted'
     ORDER BY c.proposed_at ASC`,
    [userId]
  )).rows;

  const history = (await query(
    `SELECT c.*, u1.name AS challenger_name, u2.name AS opponent_name, w.name AS winner_name,
            CASE WHEN c.challenger_id = $1 THEN c.opponent_id ELSE c.challenger_id END AS counterpart_id,
            CASE WHEN c.challenger_id = $1 THEN u2.name ELSE u1.name END AS counterpart_name
     FROM challenges c
     JOIN users u1 ON u1.id = c.challenger_id
     JOIN users u2 ON u2.id = c.opponent_id
     LEFT JOIN users w ON w.id = c.winner_id
     WHERE (c.challenger_id = $1 OR c.opponent_id = $1)
       AND c.status IN ('completed','declined','cancelled')
     ORDER BY c.updated_at DESC
     LIMIT 25`,
    [userId]
  )).rows;

  const feedbackGiven = (await query(
    `SELECT challenge_id, to_user_id
     FROM challenge_feedback
     WHERE from_user_id = $1`,
    [userId]
  )).rows;
  const feedbackGivenKeys = feedbackGiven.map((f) => `${f.challenge_id}:${f.to_user_id}`);

  const policyCounters = await getPolicyCounters(userId);

  res.render('challenges', {
    title: 'Challenges',
    incoming,
    outgoing,
    upcoming,
    history,
    feedbackGivenKeys,
    policyCounters,
  });
});

router.get('/hosted-matches', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const policyCounters = await getPolicyCounters(userId);

  const hostedOpen = (await query(
    `SELECT hm.*, u.name AS host_name,
            COUNT(hmp.id)::int AS joined_count,
            BOOL_OR(hmp.user_id = $1) AS am_joined
     FROM hosted_matches hm
     JOIN users u ON u.id = hm.host_id
     LEFT JOIN hosted_match_participants hmp ON hmp.hosted_match_id = hm.id
     WHERE hm.status IN ('open', 'full')
       AND hm.scheduled_at >= NOW() - INTERVAL '30 minutes'
     GROUP BY hm.id, u.name
     ORDER BY hm.scheduled_at ASC
     LIMIT 100`,
    [userId]
  )).rows;

  const myHosted = (await query(
    `SELECT hm.*, COUNT(hmp.id)::int AS joined_count
     FROM hosted_matches hm
     LEFT JOIN hosted_match_participants hmp ON hmp.hosted_match_id = hm.id
     WHERE hm.host_id = $1
     GROUP BY hm.id
     ORDER BY hm.scheduled_at DESC
     LIMIT 30`,
    [userId]
  )).rows;

  res.render('hosted_matches', {
    title: 'Host a Session',
    policyCounters,
    hostedOpen,
    myHosted,
    hostedLocations: HOSTED_LOCATIONS,
  });
});

router.get('/challenges/new/:opponentId', requireAuth, async (req, res) => {
  const opponentId = Number(req.params.opponentId);
  if (!Number.isInteger(opponentId) || opponentId === req.session.userId) {
    return res.status(400).send('Invalid opponent.');
  }
  const opp = (await query('SELECT id, name, city, skill_rating FROM users WHERE id = $1', [opponentId])).rows[0];
  if (!opp) return res.status(404).render('not_found', { title: 'Not found' });
  res.render('challenge_new', { title: `Challenge ${opp.name}`, opponent: opp, form: {} });
});

router.post('/hosted-matches', requireAuth, async (req, res) => {
  if (!(await enforceVerifiedPhone(req, res, `/players/${req.session.userId}/edit`))) return;

  const title = String(req.body.title || '').trim();
  const location = String(req.body.location || '').trim();
  const shuttleType = String(req.body.shuttle_type || '').trim().toLowerCase();
  const matchLevel = Number.parseInt(req.body.match_level, 10);
  const message = String(req.body.message || '').trim() || null;
  const maxPlayers = Number.parseInt(req.body.max_players, 10);
  const when = new Date(req.body.scheduled_at || '');

  if (!title || !location || !req.body.scheduled_at) {
    flash(req, 'error', 'Title, date/time, and location are required to host a match.');
    return res.redirect('/hosted-matches');
  }
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60 * 1000) {
    flash(req, 'error', 'Hosted match must be scheduled for the future.');
    return res.redirect('/hosted-matches');
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 12) {
    flash(req, 'error', 'Max players must be between 2 and 12.');
    return res.redirect('/hosted-matches');
  }
  if (!HOSTED_LOCATIONS.includes(location)) {
    flash(req, 'error', 'Please select a valid location from the list.');
    return res.redirect('/hosted-matches');
  }
  if (!HOSTED_SHUTTLE_TYPES.has(shuttleType)) {
    flash(req, 'error', 'Please choose feathers or plastics for shuttles.');
    return res.redirect('/hosted-matches');
  }
  if (!Number.isInteger(matchLevel) || matchLevel < 1 || matchLevel > 10) {
    flash(req, 'error', 'Match level must be between 1 and 10.');
    return res.redirect('/hosted-matches');
  }

  if (!(await enforcePolicyGuards(req, res, '/hosted-matches'))) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const insertMatch = await client.query(
      `INSERT INTO hosted_matches (host_id, title, scheduled_at, location, shuttle_type, match_level, max_players, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [req.session.userId, title, when.toISOString(), location, shuttleType, matchLevel, maxPlayers, message]
    );
    await client.query(
      `INSERT INTO hosted_match_participants (hosted_match_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (hosted_match_id, user_id) DO NOTHING`,
      [insertMatch.rows[0].id, req.session.userId]
    );
    await client.query('COMMIT');
    flash(req, 'success', 'Hosted match created.');
  } catch (_err) {
    await client.query('ROLLBACK');
    flash(req, 'error', 'Could not create hosted match.');
  } finally {
    client.release();
  }

  res.redirect('/hosted-matches');
});

router.post('/hosted-matches/:id/join', requireAuth, async (req, res) => {
  if (!(await enforceVerifiedPhone(req, res, `/players/${req.session.userId}/edit`))) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(
      `SELECT * FROM hosted_matches WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const m = matchRes.rows[0];
    if (!m) throw new Error('not_found');
    if (m.status === 'cancelled') throw new Error('cancelled');
    if (new Date(m.scheduled_at).getTime() < Date.now() - 60 * 1000) throw new Error('past');

    const already = await client.query(
      `SELECT 1 FROM hosted_match_participants WHERE hosted_match_id = $1 AND user_id = $2`,
      [id, req.session.userId]
    );
    if (already.rowCount > 0) throw new Error('already_joined');

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM hosted_match_participants WHERE hosted_match_id = $1`,
      [id]
    );
    const count = countRes.rows[0].count;
    if (count >= m.max_players) throw new Error('full');

    await client.query(
      `INSERT INTO hosted_match_participants (hosted_match_id, user_id) VALUES ($1, $2)`,
      [id, req.session.userId]
    );

    const nextCount = count + 1;
    if (nextCount >= m.max_players) {
      await client.query(
        `UPDATE hosted_matches SET status = 'full', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    }
    await client.query('COMMIT');
    flash(req, 'success', 'You joined the hosted match.');
  } catch (_err) {
    await client.query('ROLLBACK');
    flash(req, 'error', 'Could not join hosted match.');
  } finally {
    client.release();
  }

  res.redirect('/hosted-matches');
});

router.post('/hosted-matches/:id/leave', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(
      `SELECT * FROM hosted_matches WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const m = matchRes.rows[0];
    if (!m) throw new Error('not_found');
    if (m.host_id === req.session.userId) throw new Error('host_cannot_leave');

    await client.query(
      `DELETE FROM hosted_match_participants WHERE hosted_match_id = $1 AND user_id = $2`,
      [id, req.session.userId]
    );

    if (m.status === 'full') {
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM hosted_match_participants WHERE hosted_match_id = $1`,
        [id]
      );
      if (countRes.rows[0].count < m.max_players) {
        await client.query(
          `UPDATE hosted_matches SET status = 'open', updated_at = NOW() WHERE id = $1`,
          [id]
        );
      }
    }

    await client.query('COMMIT');
    flash(req, 'success', 'You left the hosted match.');
  } catch (_err) {
    await client.query('ROLLBACK');
    flash(req, 'error', 'Could not leave hosted match.');
  } finally {
    client.release();
  }
  res.redirect('/hosted-matches');
});

router.post('/hosted-matches/:id/complete', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(
      `SELECT * FROM hosted_matches WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const m = matchRes.rows[0];
    if (!m) throw new Error('not_found');
    if (m.host_id !== req.session.userId) throw new Error('forbidden');
    if (!['open', 'full'].includes(m.status)) throw new Error('not_completable');

    await client.query(
      `UPDATE hosted_matches SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await awardPoints(client, {
      userId: m.host_id,
      points: POINTS_HOST,
      reason: 'hosted',
      sourceType: 'hosted_match',
      sourceId: id,
    });

    await client.query('COMMIT');
    flash(req, 'success', `Match completed. ${POINTS_HOST} points awarded to you. Mark each participant as attended or no-show to settle player points.`);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err && err.message === 'forbidden') {
      flash(req, 'error', 'Only the host can mark a match as completed.');
    } else if (err && err.message === 'not_completable') {
      flash(req, 'error', 'This match cannot be marked completed.');
    } else {
      flash(req, 'error', 'Could not complete hosted match.');
    }
  } finally {
    client.release();
  }

  res.redirect(`/hosted-matches/${id}`);
});

router.post('/hosted-matches/:id/cancel', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

  const result = await query(
    `UPDATE hosted_matches
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND host_id = $2 AND status <> 'cancelled'
     RETURNING id`,
    [id, req.session.userId]
  );
  if (result.rowCount === 0) {
    flash(req, 'error', 'Could not cancel hosted match.');
  } else {
    flash(req, 'success', 'Hosted match cancelled.');
  }
  res.redirect('/hosted-matches');
});

router.get('/hosted-matches/:id/participants/status', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

  const matchRes = await query(
    `SELECT hm.*, u.name AS host_name
     FROM hosted_matches hm
     JOIN users u ON u.id = hm.host_id
     WHERE hm.id = $1`,
    [id]
  );
  const match = matchRes.rows[0];
  if (!match) return res.status(404).render('not_found', { title: 'Not found' });
  if (match.host_id !== req.session.userId) {
    flash(req, 'error', 'Only the host can mark participant status.');
    return res.redirect(`/hosted-matches/${id}`);
  }
  if (match.status !== 'completed') {
    flash(req, 'error', 'You can mark participant status only after the match is completed.');
    return res.redirect(`/hosted-matches/${id}`);
  }

  const participants = (await query(
    `SELECT u.id, u.name, u.city,
            COALESCE(hf.attendance_status, 'undecided') AS attendance_status,
            COALESCE(hf.payment_status, 'undecided') AS payment_status,
            hf.note
     FROM hosted_match_participants hmp
     JOIN users u ON u.id = hmp.user_id
     LEFT JOIN hosted_match_feedback hf
       ON hf.hosted_match_id = hmp.hosted_match_id
      AND hf.from_user_id = $2
      AND hf.to_user_id = hmp.user_id
     WHERE hmp.hosted_match_id = $1
       AND hmp.user_id <> $2
     ORDER BY u.name ASC`,
    [id, req.session.userId]
  )).rows;

  res.render('hosted_match_mark_status', {
    title: 'Mark participant status',
    match,
    participants,
  });
});

router.post('/hosted-matches/:id/participants/status', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(
      `SELECT * FROM hosted_matches WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const match = matchRes.rows[0];
    if (!match) throw new Error('not_found');
    if (match.host_id !== req.session.userId) throw new Error('forbidden');
    if (match.status !== 'completed') throw new Error('not_completed');

    const participantsRes = await client.query(
      `SELECT user_id
       FROM hosted_match_participants
       WHERE hosted_match_id = $1
         AND user_id <> $2`,
      [id, req.session.userId]
    );

    for (const row of participantsRes.rows) {
      const participantId = row.user_id;
      const attendanceStatus = String(req.body[`attendance_${participantId}`] || 'undecided');
      const paymentStatus = String(req.body[`payment_${participantId}`] || 'undecided');
      const note = String(req.body[`note_${participantId}`] || '').trim() || null;

      const safeAttendanceStatus = HOSTED_ATTENDANCE_STATUSES.has(attendanceStatus) ? attendanceStatus : 'undecided';
      const safePaymentStatus = HOSTED_PAYMENT_STATUSES.has(paymentStatus) ? paymentStatus : 'undecided';

      await client.query(
        `INSERT INTO hosted_match_feedback (
           hosted_match_id, from_user_id, to_user_id, attendance_status, payment_status, note
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (hosted_match_id, from_user_id, to_user_id)
         DO UPDATE SET
           attendance_status = EXCLUDED.attendance_status,
           payment_status = EXCLUDED.payment_status,
           note = EXCLUDED.note,
           updated_at = NOW()`,
        [id, req.session.userId, participantId, safeAttendanceStatus, safePaymentStatus, note]
      );

      if (safeAttendanceStatus === 'attended') {
        await awardPoints(client, {
          userId: participantId,
          points: POINTS_ATTEND,
          reason: 'attended',
          sourceType: 'hosted_match',
          sourceId: id,
        });
        await maybeRewardReferrer(client, participantId);
      }
    }

    await client.query('COMMIT');
    flash(req, 'success', 'Participant status saved. Attendance points were awarded only to players marked as attended.');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err && err.message === 'forbidden') {
      flash(req, 'error', 'Only the host can mark participant status.');
    } else if (err && err.message === 'not_completed') {
      flash(req, 'error', 'You can mark participant status only after match completion.');
    } else {
      flash(req, 'error', 'Could not save participant status.');
    }
  } finally {
    client.release();
  }

  res.redirect(`/hosted-matches/${id}`);
});

router.get('/hosted-matches/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');
  const userId = req.session.userId;

  const matchRes = await query(
    `SELECT hm.*, u.name AS host_name, u.city AS host_city
     FROM hosted_matches hm
     JOIN users u ON u.id = hm.host_id
     WHERE hm.id = $1`,
    [id]
  );
  const match = matchRes.rows[0];
  if (!match) return res.status(404).render('not_found', { title: 'Not found' });

  const participants = (await query(
    `SELECT u.id, u.name, u.city, hmp.created_at AS joined_at,
            COALESCE(hf.attendance_status, 'undecided') AS attendance_status,
            COALESCE(hf.payment_status, 'undecided') AS payment_status,
            hf.note
     FROM hosted_match_participants hmp
     JOIN users u ON u.id = hmp.user_id
     LEFT JOIN hosted_match_feedback hf
       ON hf.hosted_match_id = hmp.hosted_match_id
      AND hf.from_user_id = $2
      AND hf.to_user_id = hmp.user_id
     WHERE hmp.hosted_match_id = $1
     ORDER BY hmp.created_at ASC`,
    [id, match.host_id]
  )).rows;

  const isHost = match.host_id === userId;
  const isParticipant = participants.some((p) => p.id === userId);
  const canChat = isHost || isParticipant;

  let messages = [];
  if (canChat) {
    messages = (await query(
      `SELECT m.id, m.body, m.created_at, m.user_id, u.name AS user_name
       FROM hosted_match_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.hosted_match_id = $1
       ORDER BY m.created_at ASC
       LIMIT 500`,
      [id]
    )).rows;
  }

  res.render('hosted_match_detail', {
    title: match.title,
    match,
    participants,
    messages,
    isHost,
    isParticipant,
    canChat,
  });
});

router.post('/hosted-matches/:id/messages', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

  const body = String(req.body.body || '').trim();
  if (!body) {
    flash(req, 'error', 'Message cannot be empty.');
    return res.redirect(`/hosted-matches/${id}#chat`);
  }
  if (body.length > 1000) {
    flash(req, 'error', 'Message is too long (max 1000 characters).');
    return res.redirect(`/hosted-matches/${id}#chat`);
  }

  const allowed = await query(
    `SELECT 1
     FROM hosted_matches hm
     LEFT JOIN hosted_match_participants hmp
       ON hmp.hosted_match_id = hm.id AND hmp.user_id = $2
     WHERE hm.id = $1
       AND (hm.host_id = $2 OR hmp.user_id IS NOT NULL)`,
    [id, req.session.userId]
  );
  if (allowed.rowCount === 0) {
    flash(req, 'error', 'Only the host and joined players can chat in this match.');
    return res.redirect(`/hosted-matches/${id}#chat`);
  }

  try {
    await query(
      `INSERT INTO hosted_match_messages (hosted_match_id, user_id, body)
       VALUES ($1, $2, $3)`,
      [id, req.session.userId, body]
    );
  } catch (_err) {
    flash(req, 'error', 'Could not post message.');
  }

  res.redirect(`/hosted-matches/${id}#chat`);
});

router.post('/challenges', requireAuth, async (req, res) => {
  if (!(await enforceVerifiedPhone(req, res, `/players/${req.session.userId}/edit`))) return;

  const { opponent_id, proposed_at, location, message } = req.body;
  const opponentId = Number(opponent_id);

  if (!Number.isInteger(opponentId) || opponentId === req.session.userId) {
    flash(req, 'error', 'Pick a valid opponent.');
    return res.redirect('/players');
  }
  if (!proposed_at || !location) {
    flash(req, 'error', 'Date/time and location are required.');
    return res.redirect(`/challenges/new/${opponentId}`);
  }

  const when = new Date(proposed_at);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60 * 1000) {
    flash(req, 'error', 'Pick a future date and time.');
    return res.redirect(`/challenges/new/${opponentId}`);
  }

  if (!(await enforcePolicyGuards(req, res, `/challenges/new/${opponentId}`))) return;

  await query(
    `INSERT INTO challenges (challenger_id, opponent_id, proposed_at, location, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.session.userId, opponentId, when.toISOString(), location.trim(), (message || '').trim() || null]
  );

  flash(req, 'success', 'Challenge sent!');
  res.redirect('/challenges');
});

async function updateStatus(req, res, newStatus) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).send('Invalid id');

  const result = await query(
    `UPDATE challenges
     SET status = $1, updated_at = NOW()
     WHERE id = $2
       AND status = 'pending'
       AND ( ($1 IN ('accepted','declined') AND opponent_id = $3)
          OR ($1 = 'cancelled' AND challenger_id = $3) )
     RETURNING id`,
    [newStatus, id, req.session.userId]
  );

  if (result.rowCount === 0) {
    flash(req, 'error', 'Could not update that challenge.');
  } else {
    if (newStatus === 'cancelled') {
      const counters = await getPolicyCounters(req.session.userId);
      if (counters.cancellations30d >= MAX_CANCELLATIONS_30D) {
        flash(req, 'error', 'Challenge cancelled. Warning: repeated cancellations can restrict your account.');
        return res.redirect('/challenges');
      }
    }
    flash(req, 'success', `Challenge ${newStatus}.`);
  }
  res.redirect('/challenges');
}

router.post('/challenges/:id/accept', requireAuth, async (req, res) => {
  if (!(await enforceVerifiedPhone(req, res, `/players/${req.session.userId}/edit`))) return;
  return updateStatus(req, res, 'accepted');
});
router.post('/challenges/:id/decline', requireAuth, (req, res) => updateStatus(req, res, 'declined'));
router.post('/challenges/:id/cancel', requireAuth, (req, res) => updateStatus(req, res, 'cancelled'));

router.post('/challenges/:id/result', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const winnerId = Number(req.body.winner_id);
  const score = (req.body.score || '').trim() || null;

  if (!Number.isInteger(id) || !Number.isInteger(winnerId)) {
    return res.status(400).send('Invalid input.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cRes = await client.query(
      `SELECT * FROM challenges WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const c = cRes.rows[0];
    if (!c) throw new Error('not_found');

    const isParticipant = c.challenger_id === req.session.userId || c.opponent_id === req.session.userId;
    if (!isParticipant) throw new Error('forbidden');
    if (c.status !== 'accepted') throw new Error('not_accepted');
    if (winnerId !== c.challenger_id && winnerId !== c.opponent_id) throw new Error('bad_winner');

    const loserId = winnerId === c.challenger_id ? c.opponent_id : c.challenger_id;

    await client.query(
      `UPDATE challenges
       SET status = 'completed', winner_id = $1, score = $2, updated_at = NOW()
       WHERE id = $3`,
      [winnerId, score, id]
    );
    await grantEligibleBadges(client, winnerId);
    await grantEligibleBadges(client, loserId);
    await awardPoints(client, { userId: c.challenger_id, points: POINTS_ATTEND, reason: 'attended', sourceType: 'challenge', sourceId: id });
    await awardPoints(client, { userId: c.opponent_id, points: POINTS_ATTEND, reason: 'attended', sourceType: 'challenge', sourceId: id });
    await maybeRewardReferrer(client, c.challenger_id);
    await maybeRewardReferrer(client, c.opponent_id);
    await client.query('COMMIT');

    flash(req, 'success', 'Result recorded.');
  } catch (err) {
    await client.query('ROLLBACK');
    flash(req, 'error', 'Could not record result.');
  } finally {
    client.release();
  }

  res.redirect('/challenges');
});

router.post('/challenges/:id/feedback', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const toUserId = Number(req.body.to_user_id);
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || '').trim() || null;
  const reportedNoShow = req.body.reported_no_show === 'on';
  const reportedNonPayment = req.body.reported_non_payment === 'on';

  if (!Number.isInteger(id) || !Number.isInteger(toUserId) || !Number.isInteger(rating) || rating < 1 || rating > 10) {
    flash(req, 'error', 'Feedback rating must be between 1 and 10.');
    return res.redirect('/challenges');
  }

  const challengeRes = await query(
    `SELECT *
     FROM challenges
     WHERE id = $1`,
    [id]
  );
  const challenge = challengeRes.rows[0];
  if (!challenge) {
    flash(req, 'error', 'Challenge not found.');
    return res.redirect('/challenges');
  }

  const isParticipant = challenge.challenger_id === req.session.userId || challenge.opponent_id === req.session.userId;
  if (!isParticipant) {
    flash(req, 'error', 'You cannot submit feedback for this challenge.');
    return res.redirect('/challenges');
  }
  if (!['completed', 'cancelled'].includes(challenge.status)) {
    flash(req, 'error', 'Feedback is available only after the match history is finalized.');
    return res.redirect('/challenges');
  }

  const expectedTarget = challenge.challenger_id === req.session.userId ? challenge.opponent_id : challenge.challenger_id;
  if (toUserId !== expectedTarget) {
    flash(req, 'error', 'Invalid feedback target.');
    return res.redirect('/challenges');
  }

  try {
    await query(
      `INSERT INTO challenge_feedback
       (challenge_id, from_user_id, to_user_id, rating, comment, reported_no_show, reported_non_payment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, req.session.userId, toUserId, rating, comment, reportedNoShow, reportedNonPayment]
    );
    flash(req, 'success', 'Feedback submitted.');
  } catch (_err) {
    flash(req, 'error', 'Feedback already submitted for this match.');
  }

  return res.redirect('/challenges');
});

router.post('/wall-of-shame/appeals', requireAuth, async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason || reason.length < 10) {
    flash(req, 'error', 'Appeal reason must be at least 10 characters.');
    return res.redirect('/wall-of-shame');
  }

  const pending = await query(
    `SELECT id
     FROM wall_of_shame_appeals
     WHERE user_id = $1 AND status = 'pending'`,
    [req.session.userId]
  );
  if (pending.rowCount > 0) {
    flash(req, 'error', 'You already have a pending appeal.');
    return res.redirect('/wall-of-shame');
  }

  await query(
    `INSERT INTO wall_of_shame_appeals (user_id, reason)
     VALUES ($1, $2)`,
    [req.session.userId, reason]
  );

  flash(req, 'success', 'Appeal submitted. Admins will review it soon.');
  return res.redirect('/wall-of-shame');
});

router.get('/wall-of-shame', requireAuth, async (req, res) => {
  const expiryWindowDays = 90;
  const rows = (await query(
    `SELECT u.id, u.name, u.city,
            COALESCE(f.no_show_count, 0) AS no_show_count,
            COALESCE(f.non_payment_count, 0) AS non_payment_count,
            COALESCE(f.avg_rating, 0) AS avg_rating,
            COALESCE(c.cancellations_30d, 0) AS cancellations_30d,
            la.status AS appeal_status,
            la.valid_until AS appeal_valid_until,
            la.reviewed_note AS appeal_reviewed_note
     FROM users u
     LEFT JOIN (
       SELECT to_user_id,
              SUM(CASE WHEN reported_no_show THEN 1 ELSE 0 END)::int AS no_show_count,
              SUM(CASE WHEN reported_non_payment THEN 1 ELSE 0 END)::int AS non_payment_count,
              ROUND(AVG(rating)::numeric, 1) AS avg_rating
       FROM challenge_feedback
       WHERE created_at >= NOW() - INTERVAL '90 days'
       GROUP BY to_user_id
     ) f ON f.to_user_id = u.id
     LEFT JOIN (
       SELECT challenger_id AS user_id,
              COUNT(*)::int AS cancellations_30d
       FROM challenges
       WHERE status = 'cancelled'
         AND updated_at >= NOW() - INTERVAL '30 days'
       GROUP BY challenger_id
     ) c ON c.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT status, valid_until, reviewed_note
       FROM wall_of_shame_appeals wsa
       WHERE wsa.user_id = u.id
       ORDER BY created_at DESC
       LIMIT 1
     ) la ON TRUE
     WHERE (
            COALESCE(f.no_show_count, 0) > 0
         OR COALESCE(f.non_payment_count, 0) > 0
         OR COALESCE(c.cancellations_30d, 0) >= 3
       )
       AND NOT (la.status = 'approved' AND la.valid_until IS NOT NULL AND la.valid_until > NOW())
     ORDER BY (COALESCE(f.no_show_count, 0) * 3 + COALESCE(f.non_payment_count, 0) * 2 + COALESCE(c.cancellations_30d, 0)) DESC,
              COALESCE(f.avg_rating, 0) ASC,
              u.name ASC
     LIMIT 100`
  )).rows;

  const myAppeal = (await query(
    `SELECT id, status, reason, reviewed_note, created_at, reviewed_at, valid_until
     FROM wall_of_shame_appeals
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.session.userId]
  )).rows[0] || null;

  const isCurrentUserFlagged = rows.some((r) => r.id === req.session.userId);

  res.render('wall_of_shame', {
    title: 'Wall of Shame',
    offenders: rows,
    myAppeal,
    isCurrentUserFlagged,
    expiryWindowDays,
  });
});

export default router;
