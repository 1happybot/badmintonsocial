# 🚀 Quick Start - Test Your Onboarding Now

## Step 1: Start the Development Server

```bash
cd /Users/akshay.patil/Projects/badmintonsocial
npm run dev
```

Wait for: `TopMinton listening on http://localhost:3000`

---

## Step 2: Test New User Registration

1. Open http://localhost:3000
2. Click "Get Started" or "Register"
3. Fill in the form:
   - Name: "Test User"
   - Email: "test@example.com"
   - Password: "TestPass123"
   - City: "Stockholm"
   - Skill Rating: 5
   - Accept ToS
4. Click "Register"
5. Check console for email verification link (in dev mode)
6. Verify email (simulate by visiting verification URL)

---

## Step 3: Automatic Redirect to Onboarding

**Expected: Page redirects to `/onboarding/welcome`**

You should see:
- Welcome message
- Skill rating scale (1-10) with colors
- Platform features (4 cards)
- "Continue" and "Skip for now" buttons

✅ **If you see this, onboarding middleware is working!**

---

## Step 4: Test Welcome Screen

Click **"Continue"** button

**Expected: Redirects to `/onboarding/phone`**

---

## Step 5: Test Phone Verification

You should see:
- Progress bar (1/3)
- "Why verify?" benefits section
- Phone input field
- "Send Verification Code" button

### Send Code
1. Enter phone: `+46701234567`
2. Click "Send Code"

**Expected:**
- Phone number auto-formats to `+46701234567`
- "Code sent!" message appears
- Code input field appears
- Check **console logs** for SMS simulation

### Verify Code
1. Check console output for the 6-digit code
2. Copy the code
3. Paste into "Enter Verification Code" field
4. Click "Verify Code"

**Expected:**
- Success message
- Page reloads showing verified badge
- "Next Step" button appears

---

## Step 6: Test First Event Screen

Click **"Next Step"** button

**Expected: Redirects to `/onboarding/first-event`**

You should see:
- Progress bar (2/3)
- Two choice cards:
  - "Join a Match" (with hover effect)
  - "Host an Event" (with hover effect)
- Shepherd.js tour tooltip explaining the choice
- Quick tips section

### Complete Onboarding
1. Click either "Join a Match" or "Host an Event"

**Expected:**
- Onboarding completes
- Redirects to appropriate page
- User marked as `onboarding_completed_at = NOW()`

---

## Step 7: Check Dashboard

Navigate to http://localhost:3000/challenges

**Expected to see:**
- Profile Completeness Indicator card (top)
- Shows:
  - "X% complete"
  - Progress bar
  - 7-item checklist
  - Link to "Complete" profile

---

## Step 8: Verify Database

Check that onboarding columns were created:

```sql
SELECT 
  id, 
  email, 
  onboarding_completed_at, 
  onboarding_step, 
  onboarding_skipped_at 
FROM users 
WHERE email = 'test@example.com';
```

**Expected columns:**
- ✅ `onboarding_completed_at` = NOT NULL (if completed)
- ✅ `onboarding_step` = 'completed'
- ✅ `onboarding_skipped_at` = NULL

---

## Testing Skip Options

### Skip at Welcome
1. Delete the test user
2. Register new account again
3. At `/onboarding/welcome`, click "Skip for now"

**Expected:**
- Sets `onboarding_skipped_at = NOW()`
- Redirects to `/challenges`
- Shows profile completeness (not required to complete)

### Skip at Phone
1. At `/onboarding/phone`, click "Skip for now"

**Expected:**
- Proceeds to `/onboarding/first-event`
- Phone verification marked as skipped

---

## Troubleshooting

### ❌ Not redirecting to /onboarding/welcome?
- Check middleware in `src/server.js` line ~95
- Ensure user is logged in
- Check `onboarding_completed_at` is NULL in database

### ❌ SMS code not being sent?
- Check Twilio credentials in `.env`
- Look for error in console logs
- Phone format should be: `+46XXXXXXXXX`

### ❌ Code input not appearing?
- Try clearing browser cache
- Check browser console for JavaScript errors
- Refresh page after sending code

### ❌ Can't see profile completeness?
- Go to profile edit page
- Update some fields (add city, bio, etc.)
- Completeness percentage should update

### ❌ Page not rendering?
- Check browser console for errors
- Check server console for EJS template errors
- Verify all .ejs files exist in `src/views/onboarding/`

---

## Important Files to Know

| File | Purpose |
|------|---------|
| `src/routes/onboarding.js` | All route handlers |
| `src/views/onboarding/welcome.ejs` | Welcome screen |
| `src/views/onboarding/phone.ejs` | Phone verification |
| `src/views/onboarding/first-event.ejs` | Event choice |
| `src/views/partials/profile-completeness.ejs` | Dashboard component |
| `src/server.js` | Middleware registration |
| `src/db.js` | Database schema |

---

## Browser DevTools Tips

### Check Session State
Open console and run:
```javascript
// Check what's in session
// (server-side only - can't access directly from client)
```

### Check Network Requests
1. Open DevTools → Network tab
2. Send phone code
3. Look for POST to `/onboarding/phone/send`
4. Check response for success/error

### Check Console Logs
1. Open DevTools → Console tab
2. Should see SMS code simulation (in dev mode)
3. Look for any JavaScript errors

---

## Performance Notes

- Shepherd.js tour loads from CDN (~25KB)
- No heavy npm packages added
- Database queries have proper indexes
- Images are all inline SVGs/icons

---

## Success Indicators ✅

When working correctly, you should see:
- ✅ Smooth 3-step flow
- ✅ SMS codes being sent/verified
- ✅ Profile completeness updating
- ✅ No console errors
- ✅ Database columns created
- ✅ Onboarded users skip flow on next login

---

## Next: Deploy to Production

Once tested locally:

```bash
# Build for production
npm run build:ui

# Set production env vars
export DATABASE_URL=postgresql://...
export TWILIO_ACCOUNT_SID=...
export TWILIO_AUTH_TOKEN=...
export SESSION_SECRET=...

# Start production server
npm run prod
```

---

## Questions?

Check the detailed documentation:
- `ONBOARDING_IMPLEMENTATION.md` - Full technical details
- `ONBOARDING_COMPLETE.md` - Complete feature overview

---

**Happy testing! 🎉**
