# TopMinton Sverige 🏸

The official badminton community platform for Sweden. Find skilled opponents, host group matches, challenge friends, and build your competitive profile — all in one place.

**Built for Swedish badminton players. Launched to solve the problem of finding great opponents and organizing matches easily.**

## Mission & Vision

### Our Mission
To revolutionize how badminton players in Sweden find opponents, organize matches, and build friendships. We believe every player deserves easy access to challenges, competitive matches, and a supportive community of fellow badminton enthusiasts.

### Our Vision
A Sweden where every badminton player can instantly find skilled opponents, arrange matches in their city, and track their competitive journey. TopMinton is the trusted platform connecting Sweden's badminton community in one place.

## Features

- **Sweden-only player network** — all players registered and active in Swedish cities
- **Skill rating system** (1–10 scale) for player discovery and balanced matchmaking
- **Rich profiles** — preferred format, bio, avatar style, handedness, and club/tournament preferences
- **Verified signup** — one-click email confirmation link (Twilio SendGrid) before account creation, plus optional referral code and guided self-rating tooltip
- **Profile editing** — players can update extended profile details after signup
- **Swedish phone verification** — users verify a +46 number via SMS before joining hosted matches or challenge participation
- **Doubles team registration** — register as a team with partner details
- **Shuttle preference** — choose feathers, plastics, or both
- **Player discovery** — browse and filter registered players by Swedish city and skill rating
- **Direct challenges** — propose one-on-one matches with date, time, location, and message
- **Host group matches** — create matches for 2–12 players; other players join or leave dynamically
- **Hosted match settlement** — after completion, hosts mark each participant as attended/no-show and paid/unpaid
- **Match results tracking** — record completed matches with winner and score
- **Post-match feedback (1–10)** — rate counterparts and optionally report no-show/non-payment incidents
- **TopMinton points rewards** — 10 for attendance, 25 for hosting a completed session, and 50 referral milestone rewards
- **Referral system** — invite players with referral codes; referrer earns points when invitees reach attendance milestones
- **Automated fair-play policy checks** — outgoing challenge rate and cancellation abuse safeguards
- **Wall of Shame** — visibility for repeated no-shows/non-payment/cancellation abuse
- **Appeals + expiry logic** — flagged players can appeal; incidents and approved appeal visibility windows expire
- **Badge applications** — players can request profile badges and track application status
- **Admin moderation workflows** — admins review badge applications and wall-of-shame appeals
- **About Us page** — learn TopMinton's story, mission, and vision for Swedish badminton
- **Community rules & guidelines** — shared values for sportsmanship, fair play, and respect
- **City profiles** — find players in Stockholm, Gothenburg, Malmö, and all major Swedish cities
- **Email + password authentication** with secure session management and email-link verification at signup
- **Responsive Bootstrap 5 UI** — dark theme, mobile-optimized, fully accessible

## Tech Stack

- **Node.js 24+** / **Express 5.2**
- **EJS** — server-rendered, modular view templates
- **PostgreSQL** — persistent storage with session management
- **express-session** + **connect-pg-simple** — secure session handling
- **bcryptjs** — password hashing (salt rounds: 12)
- **node:test** + **supertest** — route-level flow tests
- **Bootstrap 5** (CDN) — responsive UI framework with dark theme
- **Bootstrap Icons** (CDN) — visual polish and accessibility icons

## UI & Design

- **Mobile-first responsive design** — automatically adapts from 1 to 3 columns based on screen size
- **CSS variables** — consistent spacing, colors, and typography across all pages
- **Dark theme** — optimized for comfortable viewing
- **Card-based components** — tiles, buttons, and modular layout patterns for consistency
- **Accessibility-focused** — semantic HTML, icon labels, keyboard navigation support

## Quick Start

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start a local Postgres database (Docker example)
docker run --rm -d --name badmin-pg -p 5432:5432 \
  -e POSTGRES_USER=badmin -e POSTGRES_PASSWORD=badmin_pwd \
  -e POSTGRES_DB=topminton \
  postgres:18

# 3. Configure environment
cp .env.development.example .env.development
# Edit .env.development: Set SESSION_SECRET to a long random string
# DATABASE_URL defaults to: postgresql://badmin:badmin_pwd@localhost:5432/topminton

# 4. Start the app
npm run dev
# Open http://localhost:3000

# Optional: seed demo players and match history
npm run seed:demo
```

The database schema (users, challenges, hosted_matches, session) is created automatically on startup.

### Running Tests

```bash
npm test
```

The test script runs Node's built-in test runner and sets a placeholder `DATABASE_URL` for import safety in isolated route tests.

### Running In Production Mode

```bash
# 1) Create production env file once
cp .env.production.example .env.production

# 2) Set strong production values in .env.production

# 3) Start in production mode
npm run prod
```

This starts the app with `NODE_ENV=production` and loads `.env.production`, enabling production cookie/security behavior.

### Demo Seed Data

Run the demo seed command to quickly populate the app with realistic data:

```bash
npm run seed:demo
```

This creates/updates 10 demo players and inserts randomized completed challenge results so pages look populated.

- Demo player emails: `demo.player1@topminton.se` ... `demo.player10@topminton.se`
- Demo player password: `Player123!`

### Deploying to Railway

1. Push this repository to GitHub.
2. In [Railway](https://railway.com), create a **New Project → Deploy from GitHub repo** and select this repo.
3. In the same project, click **+ New → Database → Add PostgreSQL**. Railway automatically exposes `DATABASE_URL`.
4. In the app service **Variables** tab, add:
   - `SESSION_SECRET` — generate with `openssl rand -hex 32`
   - `NODE_ENV=production`
5. Deploy. Railway runs `npm install` then `npm start` (via `railway.json`).
6. Open the generated public URL. Enjoy!

### Environment Variables

The app now supports split env files for cleaner switching:

- `.env.development` (used by `npm run dev`)
- `.env.production` (used by `npm run prod` and `npm start`)

- `DATABASE_URL` — Postgres connection string (auto-injected by Railway, or set locally)
- `SESSION_SECRET` — long random string for session encryption
- `NODE_ENV` — `development` or `production`
- `PORT` — server port (Railway sets automatically; defaults to 3000)
- `ADMIN_EMAIL` — default admin email used on first startup if no admin exists
- `ADMIN_PASSWORD` — default admin password used on first startup if no admin exists
- `ADMIN_NAME` — default admin display name used on first startup if no admin exists
- `TWILIO_ACCOUNT_SID` — Twilio account SID for Verify API
- `TWILIO_AUTH_TOKEN` — Twilio auth token for Verify API
- `TWILIO_VERIFY_SERVICE_SID` — Twilio Verify Service SID used to send/check SMS verification codes
- `SENDGRID_API_KEY` — Twilio SendGrid API key used for signup confirmation emails
- `SENDGRID_FROM_EMAIL` — verified sender email used for signup confirmation emails
- `APP_BASE_URL` — public app URL used in confirmation links (example: https://topminton.akshay.im)

Local testing note:
- You can temporarily bypass phone verification for hosting/joining sessions by adding user ids/emails in `config/hosting-phone-bypass-allowlist.yml`.
- This bypass is ignored in production (`NODE_ENV=production`).

Twilio setup note:
- Enable `SMS` channel in your Twilio Verify service for phone verification.
- Configure a verified sender in Twilio SendGrid for signup confirmation emails.

### Default Admin Credentials (Development)

On each startup, the app ensures an admin account exists with credentials from environment variables (or defaults if not set).

- Admin login URL: `/admin/login`
- Default email: `admin@topminton.se`
- Default password: `admin12345`
- Default name: `Platform Admin`

To change admin credentials at any time, update your environment variables and restart:

```bash
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=your-secure-password
ADMIN_NAME=Your Admin Name
```

Then restart the app (`npm run dev` or `npm run prod`). The admin account will be created or updated with the new credentials immediately on startup.

## Project Structure

```
src/
  server.js                # Express app, session setup, route mounting
  db.js                    # Postgres pool, schema initialization
  middleware.js            # authentication helpers, flash messages
  badge-icons.js           # badge slug/name -> Bootstrap icon mapping
  profile-avatars.js       # avatar style helpers (emoji/class)
  routes/
    auth.js                # /register, /login, /logout
    players.js             # /players list/profile/edit + badge apply
    challenges.js          # challenges, hosted matches, feedback, wall-of-shame
    admin.js               # /admin login, badges/admins, appeals moderation
  views/                   # EJS templates
    home.ejs               # landing page
    about.ejs              # About Us (mission, vision, story)
    register.ejs           # signup with Swedish cities
    register_check_email.ejs # post-signup check-email screen
    login.ejs              # login form
    players.ejs            # player discovery grid with filters
    challenges.ejs         # challenges + hosted matches dashboard
    rules.ejs              # community rules & guidelines
    player_profile.ejs     # individual player profile
    player_edit.ejs        # profile edit form
    wall_of_shame.ejs      # fair-play visibility + appeals
    admin_dashboard.ejs    # moderation dashboard
    partials/
      header.ejs           # sticky navbar, navigation
      footer.ejs           # footer
public/
  styles.css               # responsive CSS variables, dark theme
railway.json               # Railway build/deploy config
LOCAL_DEVELOPMENT.md       # detailed local setup guide
.env.development.example   # development environment template
.env.production.example    # production environment template
test/
  badge-flows.test.js      # badge, profile edit, and appeal moderation flow tests
```

## Pages & Features

| Page | Purpose |
|------|---------|
| `/` | Landing page with hero section and feature cards |
| `/about` | About Us — story, mission, vision for Swedish badminton |
| `/register` | Signup form with profile basics and referral support |
| `/register/check-email` | Post-signup screen asking users to confirm via email link |
| `/register/verify?token=...` | Link endpoint used from email to verify and create account |
| `/login` | Login form |
| `/players` | Player discovery — browse, filter by city & skill rating |
| `/players/:id` | Player profile — rich profile metadata, badges, feedback summary |
| `/players/:id/edit` | Self-service profile edit page |
| `/challenges` | Challenges dashboard — incoming/outgoing/upcoming/history + hosted matches + policy counters + collapsible host-match form |
| `/hosted-matches/:id` | Hosted match detail — participants, chat, completion action, and participant attendance/payment status badges |
| `/hosted-matches/:id/participants/status` | Host-only settlement page to mark participants as attended/no-show and paid/unpaid after completion |
| `/wall-of-shame` | Fair-play visibility board with appeals and expiry policy |
| `/admin` | Admin dashboard — badge applications/history, appeal moderation, badge/admin management |
| `/rules` | Community rules & guidelines (sportsmanship, equipment, disputes) |

## Database Schema

### users table
- `id` — unique identifier
- `name`, `email`, `password_hash` — account info
- `city` — Swedish city (Stockholm, Gothenburg, Malmö, etc. or custom)
- `country` — always 'Sweden'
- `skill_rating` — 1–10 self-assessed skill level
- `avatar_style`, `handedness`, `preferred_format` — player identity/preferences
- `shuttle_preference` — 'feathers', 'plastics', or 'both'
- `interested_in_tournaments`, `club_player` — player intent flags
- `team_mode`, `partner_name`, `partner_handedness`, `partner_skill_rating` — doubles-team profile fields
- `referral_code` — unique invite code for sharing with new users
- `referred_by_user_id` — referring user relation (nullable)
- `bio` — short player bio
- `topminton_points` — total earned points
- `created_at` — registration timestamp

### challenges table
- `id`, `challenger_id`, `opponent_id` — relationship
- `proposed_at`, `status` — pending/accepted/declined/completed/cancelled
- `location`, `message` — match details
- `winner_id`, `score` — result tracking

### hosted_matches table
- `id`, `host_id` — match & host
- `title`, `scheduled_at`, `location` — details
- `max_players` — capacity (2–12)
- `status` — open/full/cancelled/completed
- `message` — optional description

### hosted_match_participants table
- Links players to hosted matches (many-to-many)

### hosted_match_feedback table
- Host-submitted participant settlement for hosted matches
- `attendance_status` — `undecided`/`attended`/`no_show`
- `payment_status` — `undecided`/`paid`/`no_show`
- Optional `note` per participant
- One row per hosted match + host + participant

### badges table
- Stores platform badge definitions and auto-award criteria

### user_badges table
- Stores badges granted to each player profile

### badge_applications table
- Stores player-submitted badge requests and admin review status (`pending`, `approved`, `rejected`)

### challenge_feedback table
- Stores post-match ratings (`1-10`) and optional incident flags (`reported_no_show`, `reported_non_payment`)

### wall_of_shame_appeals table
- Stores player appeals for wall-of-shame entries with review lifecycle (`pending`, `approved`, `rejected`) and optional validity window (`valid_until`)

### session table
- Stores encrypted session data (auto-managed by express-session)

## Troubleshooting

### `permission denied for schema public` (Postgres 15+)

On Postgres 15+, the default `CREATE` privilege on the `public` schema was revoked for non-owner roles.

**Fix:** Connect as the database owner and run:
```sql
GRANT USAGE, CREATE ON SCHEMA public TO "<app_role>";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO "<app_role>";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "<app_role>";
```

On Railway, use the **Postgres** service → **Data** → **Query** terminal to run this (replace `<app_role>` with the user from your `DATABASE_URL`), then redeploy.

### Port already in use

```bash
# Change port in .env or run on a different port
PORT=4000 npm run dev
```

## Security Notes

- **Passwords**: hashed with bcryptjs (12 salt rounds), never stored in plaintext
- **Sessions**: stored in Postgres, encrypted via `SESSION_SECRET`
- **SQL injection**: prevented via parameterized queries (`pg` driver)
- **HTTPS**: enforced in production (set `secure` cookie flag when `NODE_ENV=production`)
- **CORS**: not applicable (server-rendered app)
- **Secrets**: never commit to git; use Railway Variables or `.env` (which is in `.gitignore`)

## Roadmap

- [ ] Email notifications for challenges and hosted match updates
- [ ] Support for other countries (international scaling)

## Contributing

Contributions welcome! Fork the repo, create a feature branch, and open a pull request. Please follow the existing code style and test your changes locally before submitting.

## License

MIT
