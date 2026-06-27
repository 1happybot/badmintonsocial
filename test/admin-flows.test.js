import assert from 'node:assert/strict';
import request from 'supertest';
import { test } from 'node:test';

import { createAdminRouter } from '../src/routes/admin.js';
import { buildApp } from './_helpers.js';

test('admin badge approval flow awards the badge and marks the application approved', async () => {
  const clientQueries = [];
  const client = {
    query: async (sql, params) => {
      clientQueries.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return {};
      }
      if (/SELECT\s+\*\s+FROM\s+badge_applications/i.test(sql)) {
        return { rows: [{ id: 12, user_id: 7, badge_id: 9, status: 'pending' }] };
      }
      if (/INSERT\s+INTO\s+user_badges/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      if (/UPDATE\s+badge_applications/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected client query: ${sql}`);
    },
    release: () => {},
  };

  const pool = {
    connect: async () => client,
  };

  const app = buildApp(createAdminRouter({
    pool,
    query: async () => ({ rows: [] }),
    flash: () => {},
    requireAdminAuthMiddleware: (_req, _res, next) => next(),
    bcryptLib: { compare: async () => true, hash: async () => 'hash' },
  }), {
    session: { adminId: 1 },
  });

  await request(app)
    .post('/admin/badge-applications/12/approve')
    .expect(302)
    .expect('Location', '/admin');

  assert.equal(clientQueries.some((entry) => entry.sql.includes('INSERT INTO user_badges')), true);
  assert.equal(clientQueries.some((entry) => entry.sql.includes("SET status = 'approved'")), true);
});

test('admin badge rejection flow marks the application rejected', async () => {
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if (/SET\s+status\s+=\s+'rejected'/i.test(sql)) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const app = buildApp(createAdminRouter({
    query,
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    flash: () => {},
    requireAdminAuthMiddleware: (_req, _res, next) => next(),
    bcryptLib: { compare: async () => true, hash: async () => 'hash' },
  }), {
    session: { adminId: 1 },
  });

  await request(app)
    .post('/admin/badge-applications/15/reject')
    .expect(302)
    .expect('Location', '/admin');

  assert.equal(queries.some((entry) => entry.sql.includes("SET status = 'rejected'")), true);
});

test('admin dashboard renders reviewed badge history with reviewer information', async () => {
  const query = async (sql) => {
    if (/FROM\s+badges\s+b/i.test(sql) && /created_by_name/i.test(sql)) {
      return {
        rows: [
          {
            id: 1,
            name: 'Hot Streak',
            slug: 'hot-streak',
            description: 'Awarded for winning streaks.',
            criteria_type: 'wins',
            threshold: 3,
            is_active: true,
            created_at: '2024-01-01T00:00:00.000Z',
            created_by_name: 'Admin One',
            awarded_count: 2,
          },
        ],
      };
    }
    if (/FROM\s+admins/i.test(sql) && /ORDER BY\s+created_at\s+DESC/i.test(sql)) {
      return {
        rows: [
          { id: 1, name: 'Admin One', email: 'admin@example.com', is_active: true, created_at: '2024-01-01T00:00:00.000Z' },
        ],
      };
    }
    if (/WHERE\s+ba\.status\s+=\s+'pending'/i.test(sql)) {
      return { rows: [] };
    }
    if (/WHERE\s+ba\.status\s+IN\s+\('approved',\s*'rejected'\)/i.test(sql)) {
      return {
        rows: [
          {
            id: 20,
            status: 'approved',
            note: 'Great contribution',
            created_at: '2024-01-02T00:00:00.000Z',
            reviewed_at: '2024-01-03T10:15:00.000Z',
            user_id: 7,
            user_name: 'Player One',
            badge_id: 1,
            badge_name: 'Hot Streak',
            badge_slug: 'hot-streak',
            reviewer_name: 'Admin One',
          },
        ],
      };
    }
    if (/FROM\s+wall_of_shame_appeals\s+wsa/i.test(sql) && /WHERE\s+wsa\.status\s*=\s*'pending'/i.test(sql)) {
      return { rows: [] };
    }
    if (/FROM\s+users\s+u/i.test(sql) && /ORDER BY\s+u\.is_active/i.test(sql)) {
      return { rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const app = buildApp(createAdminRouter({
    query,
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    flash: () => {},
    requireAdminAuthMiddleware: (_req, _res, next) => next(),
    bcryptLib: { compare: async () => true, hash: async () => 'hash' },
  }), {
    session: { adminId: 1 },
    renderViews: true,
  });

  const response = await request(app)
    .get('/admin')
    .expect(200);

  assert.match(response.text, /Badge Application History/);
  assert.match(response.text, /Admin One/);
  assert.match(response.text, /Hot Streak/);
  assert.match(response.text, /approved/);
});

test('admin can approve a wall-of-shame appeal', async () => {
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if (/SET\s+status\s*=\s+'approved'/i.test(sql) && /wall_of_shame_appeals/i.test(sql)) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const app = buildApp(createAdminRouter({
    query,
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    flash: () => {},
    requireAdminAuthMiddleware: (_req, _res, next) => next(),
    bcryptLib: { compare: async () => true, hash: async () => 'hash' },
  }), {
    session: { adminId: 1 },
  });

  await request(app)
    .post('/admin/wall-appeals/9/approve')
    .type('form')
    .send({ reviewed_note: 'Evidence reviewed' })
    .expect(302)
    .expect('Location', '/admin');

  const q = queries.find((entry) => /SET\s+status\s*=\s+'approved'/i.test(entry.sql));
  assert.ok(q, 'Expected approval update query');
  assert.deepEqual(q.params, [1, 'Evidence reviewed', 9]);
});

test('admin can reject a wall-of-shame appeal', async () => {
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if (/SET\s+status\s*=\s+'rejected'/i.test(sql) && /wall_of_shame_appeals/i.test(sql)) {
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const app = buildApp(createAdminRouter({
    query,
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    flash: () => {},
    requireAdminAuthMiddleware: (_req, _res, next) => next(),
    bcryptLib: { compare: async () => true, hash: async () => 'hash' },
  }), {
    session: { adminId: 1 },
  });

  await request(app)
    .post('/admin/wall-appeals/10/reject')
    .type('form')
    .send({ reviewed_note: 'Insufficient context' })
    .expect(302)
    .expect('Location', '/admin');

  const q = queries.find((entry) => /SET\s+status\s*=\s+'rejected'/i.test(entry.sql));
  assert.ok(q, 'Expected rejection update query');
  assert.deepEqual(q.params, [1, 'Insufficient context', 10]);
});
