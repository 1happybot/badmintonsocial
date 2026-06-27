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
    const r = await query('SELECT id, name, email, city, skill_rating FROM users WHERE id = $1', [id]);
    return r.rows[0] || null;
  },
  async (id) => {
    const r = await query('SELECT id, name, email FROM admins WHERE id = $1', [id]);
    return r.rows[0] || null;
  }
));

app.get('/', (req, res) => {
  res.render('home', { title: 'TopMinton Sverige' });
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About Us' });
});

app.get('/rules', (req, res) => {
  res.render('rules', { title: 'Rules & Guidelines' });
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
