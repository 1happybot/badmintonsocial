# Local Development Guide

This guide walks through running **TopMinton** on your laptop end-to-end: prerequisites, database setup, environment configuration, running the app, common workflows, and troubleshooting.

---

## 1. Prerequisites

| Tool       | Version  | Check               |
|------------|----------|---------------------|
| Node.js    | ≥ 18     | `node --version`    |
| npm        | ≥ 9      | `npm --version`     |
| PostgreSQL | ≥ 14     | `psql --version`    |
| Git        | any      | `git --version`     |

Optional but recommended:
- **Docker** — quickest way to get a local Postgres without installing it natively.
- **psql** CLI — for poking at the database.

---

## 2. Clone & install

```bash
git clone https://github.com/1happybot/topminton.git
cd topminton
npm install
```

---

## 3. Start a local Postgres

Pick **one** of the options below.

### Option A — Docker (recommended)

```bash
docker run --rm -d \
  --name bspg \
  -p 5432:5432 \
  -e POSTGRES_USER=bsuser \
  -e POSTGRES_PASSWORD=bspass \
  -e POSTGRES_DB=topminton \
  postgres:16
```

Stop it later with `docker stop bspg`.

### Option B — Homebrew (macOS)

```bash
brew install postgresql@16
brew services start postgresql@16
createuser -s bsuser            # superuser, avoids schema-permission issues
createdb -O bsuser topminton
psql -d topminton -c "ALTER USER bsuser WITH PASSWORD 'bspass';"
```

### Option C — Existing Postgres

Create a database and a user that **owns** it:

```sql
CREATE USER bsuser WITH PASSWORD 'bspass';
CREATE DATABASE topminton OWNER bsuser;
```

> If you can't make the app user the owner, see [Troubleshooting → `permission denied for schema public`](#permission-denied-for-schema-public).

---

## 4. Configure environment variables

Copy the template and edit it:

```bash
cp .env.example .env
```

Minimum values for local dev:

```env
PORT=3000
DATABASE_URL=postgres://bsuser:bspass@localhost:5432/topminton
SESSION_SECRET=any-long-random-string-for-local-dev
NODE_ENV=development
```

Generate a strong `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `.env` is gitignored — never commit real secrets.

---

## 5. Run the app

```bash
npm run dev      # auto-restarts on file changes (node --watch)
# or
npm start        # plain start
```

On boot you should see:

```
TopMinton listening on http://localhost:3000
```

The schema (`users`, `challenges`, `session` tables) is created automatically on first run via `initSchema()` in [src/db.js](src/db.js).

Open http://localhost:3000 in your browser.

---

## 6. End-to-end smoke test

1. Visit http://localhost:3000 → click **Sign up**.
2. Register two accounts in two different browsers (or one in an incognito window).
3. As user A, go to **Players**, find user B, click **Challenge**, pick a future date/time + location, send.
4. Switch to user B → **Challenges** tab → accept the incoming challenge.
5. As either user, on the upcoming match, pick a winner and a score → **Record result**.
6. Visit either profile → win/loss counters should reflect the match.

Health check:

```bash
curl http://localhost:3000/healthz
# {"ok":true}
```

---

## 7. Project layout

```
src/
  server.js          # Express entry: sessions, views, route mounting
  db.js              # Postgres pool + schema init (idempotent)
  middleware.js      # requireAuth, attachUser, flash helpers
  routes/
    auth.js          # /register, /login, /logout
    players.js       # /players (list + filter), /players/:id
    challenges.js    # /challenges (CRUD + accept/decline/cancel/result)
  views/             # EJS templates (+ partials/)
public/
  styles.css         # served at /styles.css
railway.json         # Railway deploy config
.env.example         # env template
```

---

## 8. Common dev tasks

### Inspect the database

```bash
# via docker
docker exec -it bspg psql -U bsuser -d topminton

# via host psql
psql "postgres://bsuser:bspass@localhost:5432/topminton"
```

Useful queries:

```sql
\dt                          -- list tables
SELECT id, name, email, wins, losses FROM users;
SELECT id, challenger_id, opponent_id, status, proposed_at FROM challenges ORDER BY id DESC;
SELECT COUNT(*) FROM session;  -- active sessions
```

### Reset all data

```sql
TRUNCATE challenges, users, session RESTART IDENTITY CASCADE;
```

Or nuke the whole DB and let `initSchema()` rebuild it:

```bash
docker exec -it bspg psql -U bsuser -d postgres \
  -c "DROP DATABASE topminton;" \
  -c "CREATE DATABASE topminton OWNER bsuser;"
```

### Clear your session cookie

In the browser devtools → Application → Cookies → delete the `connect.sid` cookie for `localhost:3000`.

### Run on a different port

```bash
PORT=4000 npm run dev
```

---

## 9. Editing & live-reload

`npm run dev` uses Node's built-in `--watch`, which restarts the process on changes to **`.js` files**. EJS templates and CSS are read on each request, so changes to `src/views/*.ejs` and `public/styles.css` show up on the next browser refresh — no restart needed.

---

## 10. Troubleshooting

### `permission denied for schema public`

Postgres 15+ removed the implicit `CREATE` privilege on the `public` schema from non-owner roles. As the database owner (e.g. the `postgres` superuser), run:

```sql
GRANT USAGE, CREATE ON SCHEMA public TO "bsuser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO "bsuser";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "bsuser";
```

Easiest local fix: make the app user the database owner from the start (Option A or B in section 3).

### `DATABASE_URL is not set`

You haven't created `.env`, or you're running the process from a shell that doesn't have it loaded. `dotenv` is loaded automatically by [src/server.js](src/server.js), but only reads `.env` from the **current working directory** — run `npm start` from the project root.

### `ECONNREFUSED 127.0.0.1:5432`

Postgres isn't running. Start it with `docker start bspg` (Option A) or `brew services start postgresql@16` (Option B).

### `password authentication failed for user "bsuser"`

The user/password in `DATABASE_URL` doesn't match the database. Recreate the user with the password from your `.env`, or update `.env` to match Postgres.

### `relation "session" does not exist`

The schema wasn't initialized. Confirm the app printed `TopMinton listening on …` (which only happens after `initSchema()` succeeds). If init failed, scroll up in the terminal for the actual error.

### Port 3000 already in use

```bash
lsof -i :3000          # find the PID
kill <pid>             # or pick a different port: PORT=3001 npm run dev
```

### Stale sessions after schema reset

If you truncate the `session` table while logged in, the browser cookie becomes orphaned. Clear the `connect.sid` cookie or use an incognito window.

---

## 11. Before you push

- `npm install` runs clean
- App boots and `GET /healthz` returns `{"ok":true}`
- Smoke test in section 6 still passes
- No secrets in committed files (`git diff --staged` to check)

---

Happy hacking 🏸
