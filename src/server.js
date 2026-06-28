import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimpleFactory from 'connect-pg-simple';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool, query, initSchema } from './db.js';
import { attachUser } from './middleware.js';
import { getBadgeIcon } from './badge-icons.js';
import { getAvatarClass, getAvatarEmoji } from './profile-avatars.js';
import authRoutes from './routes/auth.js';
import playerRoutes from './routes/players.js';
import challengeRoutes from './routes/challenges.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res, next) => {
  res.locals.getBadgeIcon = getBadgeIcon;
  res.locals.getAvatarClass = getAvatarClass;
  res.locals.getAvatarEmoji = getAvatarEmoji;
  next();
});

const PgStore = connectPgSimpleFactory(session);

if (!process.env.SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET is not set. Set a long random value in your environment.');
}

app.use(session({
  store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
}));

app.use(attachUser(
  async (id) => {
    const r = await query('SELECT id, name, email, city, skill_rating, is_active, phone_verified_at FROM users WHERE id = $1', [id]);
    const u = r.rows[0];
    return u && u.is_active ? u : null;
  },
  async (id) => {
    const r = await query('SELECT id, name, email FROM admins WHERE id = $1', [id]);
    return r.rows[0] || null;
  }
));

app.get('/', async (req, res) => {
  const userId = req.session.userId || 0;
  let openMatches = [];
  try {
    openMatches = (await query(
      `SELECT hm.id, hm.title, hm.scheduled_at, hm.location, hm.max_players, hm.status, hm.host_id,
              u.name AS host_name,
              COUNT(hmp.id)::int AS joined_count,
              BOOL_OR(hmp.user_id = $1) AS am_joined
       FROM hosted_matches hm
       JOIN users u ON u.id = hm.host_id
       LEFT JOIN hosted_match_participants hmp ON hmp.hosted_match_id = hm.id
       WHERE hm.status = 'open'
         AND hm.scheduled_at >= NOW()
       GROUP BY hm.id, u.name
       ORDER BY hm.scheduled_at ASC
       LIMIT 6`,
      [userId]
    )).rows;
  } catch (err) {
    console.error('[home] failed to load open matches', err);
  }
  res.render('home', { title: 'TopMinton Sverige', openMatches });
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About Us' });
});

app.get('/rules', (req, res) => {
  res.render('rules', { title: 'Rules & Guidelines' });
});

app.get('/tos', (req, res) => {
  res.render('tos', { title: 'Terms of Service' });
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use(authRoutes);
app.use(playerRoutes);
app.use(challengeRoutes);
app.use(adminRoutes);

app.use((req, res) => {
  res.status(404).render('not_found', { title: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', error: process.env.NODE_ENV === 'production' ? null : err });
});

const port = Number(process.env.PORT) || 3000;

initSchema()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`TopMinton listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to init schema:', err);
    process.exit(1);
  });
