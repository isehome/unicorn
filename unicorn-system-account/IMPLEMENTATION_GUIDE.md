# System Account Implementation Guide

## Overview

This implementation creates a "System Account" feature that allows Unicorn to act as its own entity (unicorn@isehome.com) for sending emails, managing calendar events, and storing files. The system uses OAuth to obtain and store refresh tokens, with automatic daily refresh to prevent expiration.

## Files Created

```
unicorn-system-account/
├── database/
│   └── migrations/
│       └── 20260101_system_account.sql    # Database schema
├── api/
│   ├── _systemGraph.js                    # Core Graph service
│   ├── system-account/
│   │   ├── auth.js                        # OAuth initiation
│   │   ├── callback.js                    # OAuth callback
│   │   ├── status.js                      # Get status
│   │   └── disconnect.js                  # Disconnect account
│   └── cron/
│       └── refresh-system-token.js        # Daily token refresh
├── src/
│   ├── services/
│   │   └── systemAccountService.js        # Frontend service
│   └── components/
│       └── Admin/
│           └── SystemAccountSettings.js   # Admin UI
├── vercel.json                            # Updated with cron job
└── AGENT_UPDATE.md                        # Documentation to add to AGENT.md
```

## Deployment Steps

### Step 1: Run Database Migration

Copy and run in Supabase SQL Editor:

```bash
# The migration creates:
# - system_account_credentials table
# - system_account_refresh_log table
# - is_system_account_healthy() function
# - cleanup_system_account_refresh_log() function
```

### Step 2: Copy API Files

```bash
# Core service
cp api/_systemGraph.js ~/Desktop/unicorn/api/

# Create system-account folder and copy endpoints
mkdir -p ~/Desktop/unicorn/api/system-account
cp api/system-account/*.js ~/Desktop/unicorn/api/system-account/

# Cron job
cp api/cron/refresh-system-token.js ~/Desktop/unicorn/api/cron/
```

### Step 3: Copy Frontend Files

```bash
# Service
cp src/services/systemAccountService.js ~/Desktop/unicorn/src/services/

# Component
mkdir -p ~/Desktop/unicorn/src/components/Admin
cp src/components/Admin/SystemAccountSettings.js ~/Desktop/unicorn/src/components/Admin/
```

### Step 4: Update vercel.json

Add to the crons array:
```json
{
  "path": "/api/cron/refresh-system-token",
  "schedule": "0 1 * * *"
}
```

### Step 5: Add to AdminPage.js

At the top, add import:
```jsx
import SystemAccountSettings from '../components/Admin/SystemAccountSettings';
```

In `renderIntegrationsTab()`, add the component:
```jsx
{/* System Account */}
<div className="mb-6">
  <SystemAccountSettings mode={mode} />
</div>
```

### Step 6: Azure AD Configuration

Add this redirect URI to your Azure AD app registration:
```
https://unicorn-one.vercel.app/api/system-account/callback
```

Ensure these delegated permissions are granted:
- `offline_access` (REQUIRED for refresh token)
- `openid`, `profile`, `email`
- `User.Read`
- `Mail.Send`
- `Calendars.ReadWrite`
- `Files.ReadWrite.All` (optional)

### Step 7: Deploy

```bash
cd ~/Desktop/unicorn
git add .
git commit -m "Add system account feature for Unicorn identity"
git push
```

### Step 8: Connect the Account

1. Go to Admin → Integrations
2. Find "System Account" section
3. Click "Connect System Account"
4. Log in as unicorn@isehome.com
5. Grant permissions
6. Verify "Connected" status

## How It Works

### Token Flow

```
1. Admin clicks "Connect" → OAuth redirect to Microsoft
2. User logs in as unicorn@isehome.com
3. Callback receives authorization code
4. Exchange code for access_token + refresh_token
5. Store tokens in system_account_credentials table
6. Daily cron refreshes token proactively
7. API calls use stored token, refresh if expiring soon
```

### Token Lifetime

- **Access Token:** ~1 hour (refreshed automatically)
- **Refresh Token:** ~90 days (daily cron keeps it fresh)
- **Daily Cron:** Runs at 1 AM to refresh before any expiry risk

### Fallback Behavior

If system account token fails:
1. For email: Falls back to app-only token (existing behavior)
2. For calendar: Throws error (calendar requires user context)

## Usage Examples

### Send Email as System

```javascript
const { systemSendMail } = require('./_systemGraph');

await systemSendMail({
  to: ['customer@example.com'],
  cc: ['manager@isehome.com'],
  subject: 'Your Service Ticket #12345',
  body: '<p>Your ticket has been created...</p>',
  bodyType: 'HTML',
  saveToSentItems: true
});
```

### Create Calendar Event

```javascript
const { systemCreateCalendarEvent } = require('./_systemGraph');

const result = await systemCreateCalendarEvent({
  subject: 'Service: Smith Residence',
  body: 'Network troubleshooting appointment',
  bodyType: 'text',
  start: '2026-01-15T09:00:00',
  end: '2026-01-15T11:00:00',
  location: '123 Main St, Carmel IN 46032',
  attendees: [
    { email: 'tech@isehome.com', name: 'John Tech' },
    { email: 'customer@example.com', name: 'Jane Customer' }
  ],
  showAs: 'busy'
});

console.log('Created event:', result.eventId);
```

### Check Status

```javascript
const { getSystemAccountStatus } = require('./_systemGraph');

const status = await getSystemAccountStatus();
console.log('Connected:', status.connected);
console.log('Healthy:', status.healthy);
console.log('Account:', status.accountEmail);
```

## Troubleshooting

### "No refresh token"
- Ensure `offline_access` scope is in the OAuth request
- Reconnect the account

### "Token refresh failed"
- Check Azure AD permissions
- Check password hasn't changed
- Check app hasn't been revoked

### Cron not running
- Verify vercel.json syntax
- Check Vercel dashboard → Cron Jobs
- Add CRON_SECRET for production

### 403 on Graph calls
- Ensure unicorn@isehome.com has an Exchange license
- Check mailbox exists

## Security Considerations

1. Tokens are stored in Supabase with RLS
2. Only admins should access the admin page
3. Refresh tokens are rotated when possible
4. Daily refresh prevents stale tokens
5. Consecutive failures tracked for alerting
