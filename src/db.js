import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add a Postgres plugin on Railway or set it in .env.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function initSchema() {
  // On a fresh Postgres 15+ database, the connecting role may not have CREATE
  // on the default `public` schema. Try to grant it to ourselves; if we lack
  // ownership we'll fall through and surface a helpful error below.
  try {
    await pool.query('GRANT USAGE, CREATE ON SCHEMA public TO CURRENT_USER');
  } catch (_) { /* ignore — we'll report a clearer error on the next query */ }

  try {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      city TEXT,
      skill_level TEXT CHECK (skill_level IN ('beginner','intermediate','advanced')) DEFAULT 'beginner',
      skill_rating INTEGER,
      shuttle_preference TEXT CHECK (shuttle_preference IN ('feathers','plastics','both')) DEFAULT 'both',
      bio TEXT,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS shuttle_preference TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Sweden';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS topminton_points INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

    UPDATE users
    SET referral_code = UPPER(SUBSTRING(MD5(id::text || COALESCE(email, '') || '-topminton'), 1, 8))
    WHERE referral_code IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
    CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_user_id);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_style TEXT NOT NULL DEFAULT 'smash';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS handedness TEXT NOT NULL DEFAULT 'right';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_format TEXT NOT NULL DEFAULT 'singles';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS interested_in_tournaments BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS club_player BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS team_mode BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_handedness TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS partner_skill_rating INTEGER;

    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_handedness_check;
    ALTER TABLE users ADD CONSTRAINT users_handedness_check CHECK (handedness IN ('right', 'left', 'ambidextrous'));
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_partner_handedness_check;
    ALTER TABLE users ADD CONSTRAINT users_partner_handedness_check CHECK (partner_handedness IS NULL OR partner_handedness IN ('right', 'left', 'ambidextrous'));
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_preferred_format_check;
    ALTER TABLE users ADD CONSTRAINT users_preferred_format_check CHECK (preferred_format IN ('singles', 'doubles', 'both'));
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_partner_skill_rating_check;
    ALTER TABLE users ADD CONSTRAINT users_partner_skill_rating_check CHECK (partner_skill_rating IS NULL OR partner_skill_rating BETWEEN 1 AND 10);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS skill_rating INTEGER;
    UPDATE users
    SET skill_rating = CASE skill_level
      WHEN 'beginner' THEN 3
      WHEN 'intermediate' THEN 6
      WHEN 'advanced' THEN 9
      ELSE 5
    END
    WHERE skill_rating IS NULL;
    ALTER TABLE users ALTER COLUMN skill_rating SET DEFAULT 5;
    UPDATE users SET skill_rating = 5 WHERE skill_rating IS NULL;
    ALTER TABLE users ALTER COLUMN skill_rating SET NOT NULL;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_skill_rating_check;
    ALTER TABLE users ADD CONSTRAINT users_skill_rating_check CHECK (skill_rating BETWEEN 1 AND 10);

    CREATE TABLE IF NOT EXISTS challenges (
      id SERIAL PRIMARY KEY,
      challenger_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opponent_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      proposed_at TIMESTAMPTZ NOT NULL,
      location TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','completed','cancelled')) DEFAULT 'pending',
      winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      score TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_opponent ON challenges(opponent_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);

    CREATE TABLE IF NOT EXISTS hosted_matches (
      id SERIAL PRIMARY KEY,
      host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      location TEXT NOT NULL,
      max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 12) DEFAULT 4,
      message TEXT,
      status TEXT NOT NULL CHECK (status IN ('open','full','cancelled')) DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hosted_match_participants (
      id SERIAL PRIMARY KEY,
      hosted_match_id INTEGER NOT NULL REFERENCES hosted_matches(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(hosted_match_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS hosted_match_messages (
      id SERIAL PRIMARY KEY,
      hosted_match_id INTEGER NOT NULL REFERENCES hosted_matches(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE hosted_matches DROP CONSTRAINT IF EXISTS hosted_matches_status_check;
    ALTER TABLE hosted_matches ADD CONSTRAINT hosted_matches_status_check
      CHECK (status IN ('open','full','cancelled','completed'));

    CREATE TABLE IF NOT EXISTS point_transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      points INTEGER NOT NULL CHECK (points > 0),
      reason TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, source_type, source_id, reason)
    );

    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE TABLE IF NOT EXISTS badges (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      criteria_type TEXT NOT NULL CHECK (criteria_type IN ('matches_played', 'wins', 'undefeated')),
      threshold INTEGER NOT NULL DEFAULT 1 CHECK (threshold >= 1),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, badge_id)
    );

    CREATE TABLE IF NOT EXISTS badge_applications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      note TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      reviewed_by_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS challenge_feedback (
      id SERIAL PRIMARY KEY,
      challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
      comment TEXT,
      reported_no_show BOOLEAN NOT NULL DEFAULT FALSE,
      reported_non_payment BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(challenge_id, from_user_id, to_user_id)
    );

    CREATE TABLE IF NOT EXISTS wall_of_shame_appeals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      reviewed_by_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      reviewed_note TEXT,
      reviewed_at TIMESTAMPTZ,
      valid_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_hosted_matches_host_id ON hosted_matches(host_id);
    CREATE INDEX IF NOT EXISTS idx_hosted_matches_scheduled_at ON hosted_matches(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_hosted_matches_status ON hosted_matches(status);
    CREATE INDEX IF NOT EXISTS idx_hosted_match_participants_match ON hosted_match_participants(hosted_match_id);
    CREATE INDEX IF NOT EXISTS idx_hosted_match_participants_user ON hosted_match_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_hosted_match_messages_match ON hosted_match_messages(hosted_match_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_point_transactions_user ON point_transactions(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_badges_criteria ON badges(criteria_type, threshold);
    CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
    CREATE INDEX IF NOT EXISTS idx_badge_applications_user ON badge_applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_badge_applications_badge ON badge_applications(badge_id);
    CREATE INDEX IF NOT EXISTS idx_badge_applications_status ON badge_applications(status);
    CREATE INDEX IF NOT EXISTS idx_challenge_feedback_to_user ON challenge_feedback(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_challenge_feedback_challenge ON challenge_feedback(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_challenge_feedback_flags ON challenge_feedback(reported_no_show, reported_non_payment);
    CREATE INDEX IF NOT EXISTS idx_wall_shame_appeals_user ON wall_of_shame_appeals(user_id);
    CREATE INDEX IF NOT EXISTS idx_wall_shame_appeals_status ON wall_of_shame_appeals(status);

    CREATE TABLE IF NOT EXISTS session (
      sid varchar NOT NULL COLLATE "default" PRIMARY KEY,
      sess json NOT NULL,
      expire timestamp(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
  `);

    await ensureDefaultAdmin();
    await seedDefaultBadges();
  } catch (err) {
    if (err && err.code === '42501') {
      const role = await currentRole();
      const msg = [
        '',
        'Postgres permission error: the role "' + role + '" cannot CREATE in schema "public".',
        'Fix by connecting to Postgres as the database OWNER (e.g. the `postgres` superuser) and running:',
        '',
        '  GRANT USAGE, CREATE ON SCHEMA public TO "' + role + '";',
        '  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "' + role + '";',
        '  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "' + role + '";',
        '',
        'On Railway: open the Postgres service → Data tab → Query, run the SQL above as the',
        '`postgres` user, then redeploy. Alternatively, point DATABASE_URL at the database owner role.',
        ''
      ].join('\n');
      const e = new Error(msg);
      e.cause = err;
      throw e;
    }
    throw err;
  }
}

async function ensureDefaultAdmin() {
  const email = String(process.env.ADMIN_EMAIL || 'admin@topminton.se').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || 'admin12345');
  const name = String(process.env.ADMIN_NAME || 'Platform Admin').trim();

  const existing = await pool.query('SELECT id FROM admins WHERE email = $1', [email]);
  if (existing.rowCount > 0) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admins (email, password_hash, name)
     VALUES ($1, $2, $3)`,
    [email, passwordHash, name]
  );
}

async function seedDefaultBadges() {
  await pool.query(
    `INSERT INTO badges (name, slug, description, criteria_type, threshold)
     VALUES
       ('10 Matches Played', '10-matches-played', 'Awarded after playing 10 matches.', 'matches_played', 10),
       ('Challenge Winner', 'challenge-winner', 'Awarded after winning your first challenge.', 'wins', 1),
       ('Undefeated 10', 'undefeated-10', 'Awarded for staying undefeated through 10 matches.', 'undefeated', 10)
     ON CONFLICT (slug) DO NOTHING`
  );
}

async function currentRole() {
  try {
    const r = await pool.query('SELECT current_user AS role');
    return r.rows[0].role;
  } catch {
    return 'app_user';
  }
}
