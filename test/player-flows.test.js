import assert from 'node:assert/strict';
import request from 'supertest';
import { test } from 'node:test';

import { createPlayerRouter } from '../src/routes/players.js';
import { buildApp } from './_helpers.js';

test('player badge application flow inserts a pending request', async () => {
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if (/SELECT\s+id\s+FROM\s+badges\s+WHERE\s+id\s+=\s+\$1\s+AND\s+is_active\s+=\s+TRUE/i.test(sql)) {
      return { rowCount: 1, rows: [{ id: 9 }] };
    }
    if (/SELECT\s+1\s+FROM\s+user_badges/i.test(sql)) {
      return { rowCount: 0, rows: [] };
    }
    if (/SELECT\s+1\s+FROM\s+badge_applications/i.test(sql)) {
      return { rowCount: 0, rows: [] };
    }
    if (/INSERT\s+INTO\s+badge_applications/i.test(sql)) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const app = buildApp(createPlayerRouter({ query, requireAuthMiddleware: (_req, _res, next) => next() }), {
    session: { userId: 7 },
  });

  await request(app)
    .post('/players/7/badges/apply')
    .type('form')
    .send({ badge_id: '9', note: '  consistent effort  ' })
    .expect(302)
    .expect('Location', '/players/7');

  assert.equal(queries.some((entry) => entry.sql.includes('INSERT INTO badge_applications')), true);
  assert.deepEqual(queries.at(-1).params, [7, 9, 'consistent effort']);
});

test('player badge application flow blocks duplicate pending requests', async () => {
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if (/SELECT\s+id\s+FROM\s+badges\s+WHERE\s+id\s+=\s+\$1\s+AND\s+is_active\s+=\s+TRUE/i.test(sql)) {
      return { rowCount: 1, rows: [{ id: 9 }] };
    }
    if (/SELECT\s+1\s+FROM\s+user_badges/i.test(sql)) {
      return { rowCount: 0, rows: [] };
    }
    if (/SELECT\s+1\s+FROM\s+badge_applications/i.test(sql)) {
      return { rowCount: 1, rows: [] };
    }
    if (/INSERT\s+INTO\s+badge_applications/i.test(sql)) {
      throw new Error('duplicate request should not insert');
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const app = buildApp(createPlayerRouter({ query, requireAuthMiddleware: (_req, _res, next) => next() }), {
    session: { userId: 7 },
  });

  await request(app)
    .post('/players/7/badges/apply')
    .type('form')
    .send({ badge_id: '9' })
    .expect(302)
    .expect('Location', '/players/7');

  assert.equal(queries.some((entry) => entry.sql.includes('INSERT INTO badge_applications')), false);
});

test('player profile edit requires partner name when team mode is enabled', async () => {
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if (/SELECT\s+id,\s*name,\s*city,\s*skill_rating,\s*bio,\s*avatar_style/i.test(sql)) {
      return {
        rows: [
          {
            id: 7,
            name: 'Player One',
            city: 'Stockholm',
            skill_rating: 6,
            bio: null,
            avatar_style: 'smash',
            handedness: 'right',
            preferred_format: 'singles',
            shuttle_preference: 'both',
            interested_in_tournaments: false,
            club_player: false,
            team_mode: false,
            partner_name: null,
            partner_handedness: null,
            partner_skill_rating: null,
          },
        ],
      };
    }
    if (/UPDATE\s+users/i.test(sql)) {
      throw new Error('should not update when partner name is missing in team mode');
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const app = buildApp(createPlayerRouter({ query, requireAuthMiddleware: (_req, _res, next) => next() }), {
    session: { userId: 7 },
  });

  await request(app)
    .post('/players/7/edit')
    .type('form')
    .send({
      avatar_style: 'smash',
      handedness: 'right',
      preferred_format: 'singles',
      shuttle_preference: 'both',
      team_mode: 'on',
      partner_name: '   ',
      bio: 'Ready to play',
    })
    .expect(302)
    .expect('Location', '/players/7/edit');

  assert.equal(queries.some((entry) => /UPDATE\s+users/i.test(entry.sql)), false);
});

test('player profile edit coerces singles to doubles in team mode', async () => {
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if (/UPDATE\s+users/i.test(sql)) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const app = buildApp(createPlayerRouter({ query, requireAuthMiddleware: (_req, _res, next) => next() }), {
    session: { userId: 7 },
  });

  await request(app)
    .post('/players/7/edit')
    .type('form')
    .send({
      avatar_style: 'rocket',
      handedness: 'left',
      preferred_format: 'singles',
      shuttle_preference: 'feathers',
      interested_in_tournaments: 'on',
      club_player: 'on',
      team_mode: 'on',
      partner_name: 'Partner X',
      partner_handedness: 'ambidextrous',
      partner_skill_rating: '8',
      bio: 'Team profile',
    })
    .expect(302)
    .expect('Location', '/players/7');

  const updateQuery = queries.find((entry) => /UPDATE\s+users/i.test(entry.sql));
  assert.ok(updateQuery, 'Expected UPDATE users query');
  assert.equal(updateQuery.params[2], 'doubles');
  assert.equal(updateQuery.params[6], true);
  assert.equal(updateQuery.params[7], 'Partner X');
});
