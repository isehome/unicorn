# AGENT.md Update - System Account Feature

Add this section to PART 1 under "### 7. Integrations" or create a new section:

---

### 9. System Account (Unicorn Identity)

The system account allows Unicorn to act as its own entity with a dedicated Microsoft 365 account (unicorn@isehome.com). This enables:

- **System emails** - Send notifications from unicorn@isehome.com instead of individual users
- **System calendar** - Manage a shared calendar for service scheduling
- **System files** - Store documents in a dedicated OneDrive/SharePoint location

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     System Account Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ADMIN SETUP (One-time)                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ Admin Page  │────▶│ OAuth Flow  │────▶│ Store Token │       │
│  │ Click       │     │ Login as    │     │ in Supabase │       │
│  │ "Connect"   │     │ unicorn@... │     │             │       │
│  └─────────────┘     └─────────────┘     └──────┬──────┘       │
│                                                  │               │
│  DAILY CRON (2 AM)                              │               │
│  ┌─────────────┐                                │               │
│  │ Refresh     │◀───────────────────────────────┤               │
│  │ Token       │                                │               │
│  │ Proactively │                                │               │
│  └─────────────┘                                │               │
│                                                  │               │
│  RUNTIME                                        ▼               │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ API Request │────▶│ Get Token   │────▶│ Call Graph  │       │
│  │ (send mail, │     │ (refresh if │     │ API as      │       │
│  │ create      │     │ expiring)   │     │ unicorn@... │       │
│  │ event)      │     └─────────────┘     └─────────────┘       │
│  └─────────────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Database Tables

**system_account_credentials** - Stores OAuth tokens
| Column | Type | Purpose |
|--------|------|---------|
| account_type | TEXT | 'microsoft_365' (for future expansion) |
| account_email | TEXT | unicorn@isehome.com |
| display_name | TEXT | Display name from Microsoft |
| access_token | TEXT | Current access token (~1 hour) |
| refresh_token | TEXT | Long-lived refresh token (~90 days) |
| token_expires_at | TIMESTAMPTZ | When access token expires |
| granted_scopes | TEXT[] | OAuth scopes granted |
| is_active | BOOLEAN | Whether account is connected |
| consecutive_failures | INTEGER | Token refresh failure count |
| last_error | TEXT | Last error message |

**system_account_refresh_log** - Audit trail for token refreshes
| Column | Type | Purpose |
|--------|------|---------|
| refresh_type | TEXT | 'cron', 'on_demand', 'initial_connect' |
| success | BOOLEAN | Whether refresh succeeded |
| error_message | TEXT | Error details if failed |
| token_expires_at | TIMESTAMPTZ | New expiry after refresh |

#### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/system-account/auth` | GET | Initiate OAuth flow |
| `/api/system-account/callback` | GET | OAuth callback, stores tokens |
| `/api/system-account/status` | GET | Get connection status |
| `/api/system-account/disconnect` | POST | Disconnect the account |
| `/api/cron/refresh-system-token` | GET | Daily token refresh (cron) |

#### Key Files

| Purpose | File |
|---------|------|
| Core Graph service | `api/_systemGraph.js` |
| OAuth initiation | `api/system-account/auth.js` |
| OAuth callback | `api/system-account/callback.js` |
| Status endpoint | `api/system-account/status.js` |
| Disconnect endpoint | `api/system-account/disconnect.js` |
| Daily refresh cron | `api/cron/refresh-system-token.js` |
| Frontend service | `src/services/systemAccountService.js` |
| Admin UI component | `src/components/Admin/SystemAccountSettings.js` |
| Database migration | `database/migrations/20260101_system_account.sql` |

#### Usage in Code

**Sending email as the system:**
```javascript
const { systemSendMail } = require('./_systemGraph');

await systemSendMail({
  to: ['customer@example.com'],
  subject: 'Service Ticket Created',
  body: '<p>Your ticket has been created...</p>',
  bodyType: 'HTML'
});
```

**Creating calendar events on system calendar:**
```javascript
const { systemCreateCalendarEvent } = require('./_systemGraph');

await systemCreateCalendarEvent({
  subject: 'Service Appointment - Smith Residence',
  start: '2026-01-15T09:00:00',
  end: '2026-01-15T11:00:00',
  location: '123 Main St, Carmel IN',
  attendees: [
    { email: 'tech@isehome.com', name: 'John Tech' },
    { email: 'customer@example.com', name: 'Jane Customer' }
  ]
});
```

**Getting system token (with fallback):**
```javascript
const { getSystemToken } = require('./_systemGraph');

// Returns system account token, falls back to app-only if unavailable
const { token, isSystemAccount, accountEmail } = await getSystemToken();

// Require system account (throws if not configured)
const { token } = await getSystemToken({ requireSystemAccount: true });
```

#### Token Refresh Strategy

1. **Proactive refresh on use** - Before any API call, checks if token expires in < 10 minutes
2. **Daily cron job** - Runs at 1 AM to ensure token is always fresh
3. **Automatic fallback** - If system token fails, falls back to app-only token for email
4. **Error tracking** - Consecutive failures tracked; UI shows warning after 3 failures

#### Admin UI Location

**Admin Page → Integrations Tab → System Account Section**

Features:
- Connection status with health indicator
- Connect/Reconnect button (initiates OAuth)
- Manual refresh button (for troubleshooting)
- Disconnect button (with confirmation)
- Token refresh history log
- Granted scopes display

#### Environment Variables

No new environment variables required - uses existing Azure AD credentials:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

Optional:
- `CRON_SECRET` - For securing cron endpoints in production

---

## Add to CHANGELOG:

## 2026-01-01

### System Account Feature (Major)

- **Database Migration:** `database/migrations/20260101_system_account.sql`
  - `system_account_credentials` table for OAuth token storage
  - `system_account_refresh_log` table for audit trail
  - `is_system_account_healthy()` function for health checks

- **Core Service:** `api/_systemGraph.js`
  - `getSystemToken()` - Get access token with auto-refresh
  - `systemSendMail()` - Send email as system account
  - `systemCreateCalendarEvent()` - Create calendar events
  - `systemUpdateCalendarEvent()` - Update events
  - `systemDeleteCalendarEvent()` - Delete events
  - `systemGetCalendarEvents()` - Read calendar

- **OAuth Endpoints:**
  - `api/system-account/auth.js` - Initiate OAuth
  - `api/system-account/callback.js` - Handle OAuth callback
  - `api/system-account/status.js` - Get status
  - `api/system-account/disconnect.js` - Disconnect account

- **Cron Job:** `api/cron/refresh-system-token.js`
  - Daily token refresh at 1 AM
  - Prevents token expiration
  - Logs all refresh attempts

- **Frontend:**
  - `src/services/systemAccountService.js` - Service layer
  - `src/components/Admin/SystemAccountSettings.js` - Admin UI

- **Updated:** `vercel.json` - Added cron job schedule

---

## Add to TODO/Future Improvements:

### Multi-Tenant Deployment Support

The system account feature is designed with multi-tenant deployment in mind:

1. **Per-tenant configuration** - Each deployment can have its own system account
2. **Settings export/import** - For easier deployment duplication
3. **Onboarding wizard** - Guide new tenants through setup

**Items to review for multi-tenant:**
- Database schema may need `tenant_id` column
- Environment variables need per-tenant isolation
- Azure AD app registration needs to support multiple tenants or be per-tenant
- SharePoint site structure per tenant
- Domain/subdomain strategy
