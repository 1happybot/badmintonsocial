import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { initSchema, pool } from './db.js';
import { grantEligibleBadges } from './badges.js';

const DEMO_MARKER = '[DEMO_SEED]';
const DEMO_PASSWORD = 'Player123!';

const demoPlayers = [
  { name: 'Erik Johansson', city: 'Stockholm', rating: 8, shuttle: 'feathers', bio: 'Fast doubles specialist with aggressive net play.' },
  { name: 'Sofia Lindberg', city: 'Gothenburg', rating: 7, shuttle: 'both', bio: 'Balanced singles and doubles player.' },
  { name: 'Lukas Berg', city: 'Malmö', rating: 6, shuttle: 'plastics', bio: 'Consistent baseline rallies and tactical shots.' },
  { name: 'Maja Svensson', city: 'Uppsala', rating: 9, shuttle: 'feathers', bio: 'Advanced tournament-level attacker.' },
  { name: 'Noah Karlsson', city: 'Västerås', rating: 5, shuttle: 'both', bio: 'Improving quickly with strong footwork.' },
  { name: 'Alva Nilsson', city: 'Linköping', rating: 7, shuttle: 'feathers', bio: 'Great at court coverage and placement.' },
  { name: 'Hugo Larsson', city: 'Örebro', rating: 4, shuttle: 'plastics', bio: 'New but highly motivated to compete.' },
  { name: 'Elsa Andersson', city: 'Lund', rating: 8, shuttle: 'both', bio: 'Powerful smashes and quick transitions.' },
  { name: 'Viktor Holm', city: 'Helsingborg', rating: 6, shuttle: 'feathers', bio: 'Reliable doubles partner and strategist.' },
  { name: 'Freja Ek', city: 'Umeå', rating: 5, shuttle: 'both', bio: 'All-round player who enjoys long games.' },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomDifferentIndex(currentIndex, maxExclusive) {
  let idx = currentIndex;
  while (idx === currentIndex) {
    idx = randomInt(0, maxExclusive - 1);
  }
  return idx;
}

function randomScore() {
  const a = randomInt(19, 21);
  const b = randomInt(14, 20);
  const ordered = Math.max(a, b) === 21 ? [a, b] : [21, b];
  return `${ordered[0]}-${ordered[1]}`;
}

async function upsertDemoUsers(client) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = [];

  for (let i = 0; i < demoPlayers.length; i += 1) {
    const p = demoPlayers[i];
    const email = `demo.player${i + 1}@topminton.se`;
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, city, country, skill_rating, shuttle_preference, bio)
       VALUES ($1, $2, $3, $4, 'Sweden', $5, $6, $7)
       ON CONFLICT (email)
       DO UPDATE SET
         name = EXCLUDED.name,
         city = EXCLUDED.city,
         skill_rating = EXCLUDED.skill_rating,
         shuttle_preference = EXCLUDED.shuttle_preference,
         bio = EXCLUDED.bio
       RETURNING id, name, email`,
      [p.name, email, passwordHash, p.city, p.rating, p.shuttle, p.bio]
    );
    users.push(result.rows[0]);
  }

  return users;
}

async function reseedDemoChallenges(client, userIds) {
  await client.query(
    `DELETE FROM challenges
     WHERE message = $1`,
    [DEMO_MARKER]
  );

  const challengeCount = 30;

  for (let i = 0; i < challengeCount; i += 1) {
    const challengerIdx = randomInt(0, userIds.length - 1);
    const opponentIdx = pickRandomDifferentIndex(challengerIdx, userIds.length);

    const challengerId = userIds[challengerIdx];
    const opponentId = userIds[opponentIdx];

    const winnerIsChallenger = Math.random() >= 0.5;
    const winnerId = winnerIsChallenger ? challengerId : opponentId;

    const daysAgo = randomInt(1, 45);
    const hoursAgo = randomInt(1, 23);
    const proposedAt = new Date(Date.now() - ((daysAgo * 24 + hoursAgo) * 60 * 60 * 1000));

    await client.query(
      `INSERT INTO challenges (
          challenger_id,
          opponent_id,
          proposed_at,
          location,
          message,
          status,
          winner_id,
          score,
          created_at,
          updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, NOW())`,
      [
        challengerId,
        opponentId,
        proposedAt.toISOString(),
        `Court ${randomInt(1, 12)}, ${demoPlayers[challengerIdx].city}`,
        DEMO_MARKER,
        winnerId,
        randomScore(),
        proposedAt.toISOString(),
      ]
    );
  }
}

async function reseedDemoBadges(client, userIds) {
  await client.query(
    `DELETE FROM user_badges
     WHERE user_id = ANY($1::int[])`,
    [userIds]
  );

  for (const userId of userIds) {
    await grantEligibleBadges(client, userId);
  }
}

async function main() {
  await initSchema();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const users = await upsertDemoUsers(client);
    const userIds = users.map((u) => u.id);

    await reseedDemoChallenges(client, userIds);
    await reseedDemoBadges(client, userIds);

    await client.query('COMMIT');

    console.log('Demo data seeded successfully.');
    console.log('Created/updated players:');
    users.forEach((u) => console.log(`- ${u.name} (${u.email})`));
    console.log(`Demo player password: ${DEMO_PASSWORD}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to seed demo data:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
