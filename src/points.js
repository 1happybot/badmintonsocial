import crypto from 'node:crypto';

const POINTS_ATTEND = 10;
const POINTS_HOST = 25;
const POINTS_REFERRAL = 50;
const REFERRAL_ATTEND_THRESHOLD = 5;

/**
 * Idempotently award points using point_transactions as a ledger.
 * Increments users.topminton_points only when a new ledger row is inserted.
 * Pass an active transactional client (from pool.connect()) when used in a transaction.
 */
export async function awardPoints(client, { userId, points, reason, sourceType, sourceId }) {
  if (!Number.isInteger(userId) || !Number.isInteger(points) || points <= 0) {
    return false;
  }
  const r = await client.query(
    `WITH inserted AS (
       INSERT INTO point_transactions (user_id, points, reason, source_type, source_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, source_type, source_id, reason) DO NOTHING
       RETURNING points
     )
     UPDATE users
     SET topminton_points = topminton_points + COALESCE((SELECT points FROM inserted), 0)
     WHERE id = $1
     RETURNING (SELECT COUNT(*)::int FROM inserted) AS awarded`,
    [userId, points, reason, sourceType, sourceId]
  );
  return (r.rows[0]?.awarded || 0) > 0;
}

/**
 * Generates a short uppercase referral code (8 hex chars).
 */
export function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * If the given user was referred and has now attended >= 5 matches,
 * idempotently award the referrer 50 TopMinton points.
 */
export async function maybeRewardReferrer(client, attendedUserId) {
  if (!Number.isInteger(attendedUserId)) return false;

  const userRes = await client.query(
    `SELECT referred_by_user_id FROM users WHERE id = $1`,
    [attendedUserId]
  );
  const referrerId = userRes.rows[0]?.referred_by_user_id;
  if (!referrerId) return false;

  const countRes = await client.query(
    `SELECT COUNT(*)::int AS attended_count
     FROM point_transactions
     WHERE user_id = $1 AND reason = 'attended'`,
    [attendedUserId]
  );
  if ((countRes.rows[0]?.attended_count || 0) < REFERRAL_ATTEND_THRESHOLD) {
    return false;
  }

  return await awardPoints(client, {
    userId: referrerId,
    points: POINTS_REFERRAL,
    reason: 'referral_milestone',
    sourceType: 'referral',
    sourceId: attendedUserId,
  });
}

export { POINTS_ATTEND, POINTS_HOST, POINTS_REFERRAL, REFERRAL_ATTEND_THRESHOLD };
