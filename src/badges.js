export async function grantEligibleBadges(client, userId) {
  const statsRes = await client.query(
    `SELECT
        COUNT(*)::int AS matches_played,
        COUNT(*) FILTER (WHERE winner_id = $1)::int AS wins,
        COUNT(*) FILTER (WHERE winner_id IS NOT NULL AND winner_id <> $1)::int AS losses
     FROM challenges
     WHERE status = 'completed'
       AND (challenger_id = $1 OR opponent_id = $1)`,
    [userId]
  );
  const stats = statsRes.rows[0] || { matches_played: 0, wins: 0, losses: 0 };

  const wins = Number(stats.wins) || 0;
  const losses = Number(stats.losses) || 0;
  const matchesPlayed = Number(stats.matches_played) || 0;

  const badgesRes = await client.query(
    `SELECT id, criteria_type, threshold
     FROM badges
     WHERE is_active = TRUE`
  );

  const eligibleBadgeIds = [];
  for (const badge of badgesRes.rows) {
    const threshold = Math.max(1, Number(badge.threshold) || 1);
    if (badge.criteria_type === 'matches_played' && matchesPlayed >= threshold) {
      eligibleBadgeIds.push(badge.id);
    }
    if (badge.criteria_type === 'wins' && wins >= threshold) {
      eligibleBadgeIds.push(badge.id);
    }
    if (badge.criteria_type === 'undefeated' && matchesPlayed >= threshold && losses === 0) {
      eligibleBadgeIds.push(badge.id);
    }
  }

  if (eligibleBadgeIds.length === 0) return;

  await client.query(
    `INSERT INTO user_badges (user_id, badge_id)
     SELECT $1, UNNEST($2::int[])
     ON CONFLICT (user_id, badge_id) DO NOTHING`,
    [userId, eligibleBadgeIds]
  );
}
