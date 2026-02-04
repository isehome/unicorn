# QuickBooks Online Integration Guide

> **Status:** Connected to Sandbox | Ready for Testing
> **Last Updated:** 2026-02-04

---

## Overview

The Unicorn app integrates with QuickBooks Online (QBO) to automatically create invoices from completed service tickets. This eliminates double-entry and ensures accurate billing.

### Workflow

```
Service Ticket Flow:
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐     ┌─────────┐
│ in_progress │ ──▶ │  resolved   │ ──▶ │ work_complete_needs_invoice │ ──▶ │ closed  │
└─────────────┘     └─────────────┘     └─────────────────────────────┘     └─────────┘
                                                     │
                                                     ▼
                                         ┌───────────────────────┐
                                         │  Create QBO Invoice   │
                                         │  (Manual or Auto)     │
                                         └───────────────────────┘
```

---

## Current Environment

| Setting | Value |
|---------|-------|
| **Environment** | `sandbox` (testing) |
| **QBO Company** | Your sandbox company |
| **API Endpoint** | `https://sandbox-quickbooks.api.intuit.com` |
| **Invoice View URL** | `https://sandbox.qbo.intuit.com` |

### Environment Variables (Vercel)

```
QBO_CLIENT_ID=your-client-id
QBO_CLIENT_SECRET=your-client-secret
QBO_ENVIRONMENT=sandbox
QBO_REDIRECT_URI=https://unicorn.vercel.app/api/qbo/callback
```

---

## Testing Workflow

### Step 1: Verify Connection

1. Go to **Admin → Integrations → QuickBooks**
2. Verify status shows "Connected" with your sandbox company name
3. If disconnected, click "Connect to QuickBooks" to re-authenticate

### Step 2: Create Test Ticket

1. Create a new service ticket (or use existing)
2. Add **time logs** - check in/check out with technician
3. Optionally add **parts** with costs
4. Move ticket through workflow: `in_progress` → `resolved` → `work_complete_needs_invoice`

### Step 3: Test Invoice Creation

1. Open the ticket in `work_complete_needs_invoice` status
2. Look for the "Create QuickBooks Invoice" button (should appear in actions section)
3. Click to create invoice
4. Note the response:
   - Success: Invoice ID and number returned
   - Error: Error message displayed

### Step 4: Verify in QuickBooks Sandbox

1. Go to [QuickBooks Sandbox](https://sandbox.qbo.intuit.com)
2. Sign in with your developer account
3. Navigate to **Sales → Invoices**
4. Find the invoice by number
5. Verify:
   - Customer name matches ticket
   - Labor hours and rate are correct
   - Parts (if any) are listed
   - Total is accurate

### Step 5: Test Edge Cases

| Test Case | Expected Result |
|-----------|-----------------|
| Ticket with no time logs | Error: "No billable items found" |
| Ticket already exported | Error: "Already exported to QuickBooks" |
| Customer doesn't exist in QBO | Customer auto-created in QBO |
| Customer exists in QBO | Existing customer linked |
| QBO token expired | Auto-refresh, then success |
| QBO disconnected | Error: "QuickBooks is not connected" |

---

## Production Cutover

### Pre-Cutover Checklist

- [ ] All sandbox testing passed
- [ ] QuickBooks Production company ready
- [ ] Production OAuth app created in Intuit Developer Portal
- [ ] New client credentials obtained

### Step 1: Update Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```bash
# Change from sandbox to production
QBO_ENVIRONMENT=production

# Update with PRODUCTION credentials
QBO_CLIENT_ID=your-production-client-id
QBO_CLIENT_SECRET=your-production-client-secret

# Update redirect URI (same domain, just verify it's correct)
QBO_REDIRECT_URI=https://unicorn.vercel.app/api/qbo/callback
```

### Step 2: Disconnect Sandbox

1. In Unicorn Admin → Integrations → QuickBooks
2. Click "Disconnect QuickBooks"
3. This clears sandbox tokens

### Step 3: Connect Production

1. Click "Connect to QuickBooks"
2. Sign in to your **production** QuickBooks account
3. Authorize the Unicorn app
4. Verify connection shows production company name

### Step 4: Test Production

1. Create a test service ticket with minimal data
2. Add a small time entry (e.g., 0.25 hours)
3. Create invoice in QuickBooks
4. Verify it appears in production QBO
5. **Delete or void the test invoice** in QuickBooks

### Step 5: Go Live

- [ ] Notify team of production status
- [ ] Document any workflow changes
- [ ] Monitor first few real invoices

---

## Troubleshooting

### "QuickBooks is not connected"

**Cause:** No valid OAuth tokens in database

**Fix:**
1. Go to Admin → Integrations → QuickBooks
2. Click "Connect to QuickBooks"
3. Complete OAuth flow

### "Failed to create invoice"

**Cause:** Various - check error message

**Common issues:**
- Token expired → Auto-refreshes, retry
- No billable items → Add time logs or parts
- Customer mapping failed → Check contact data
- API error → Check Vercel function logs

### "This ticket has already been exported"

**Cause:** Invoice already created for this ticket

**Fix:**
- View existing invoice via the stored `qbo_invoice_id`
- If needed, void invoice in QBO and clear `qbo_invoice_id` in database

### Token Refresh Issues

Tokens auto-refresh before API calls. If issues persist:
1. Disconnect QuickBooks in Admin
2. Reconnect with fresh OAuth flow
3. Check Vercel logs for specific errors

---

## Database Schema

### Service Tickets (QBO columns)

| Column | Type | Purpose |
|--------|------|---------|
| `qbo_invoice_id` | TEXT | QBO Invoice ID |
| `qbo_invoice_number` | TEXT | QBO Invoice Number (DocNumber) |
| `qbo_synced_at` | TIMESTAMPTZ | When invoice was created |
| `qbo_sync_status` | TEXT | `pending`, `synced`, `failed`, `skipped` |
| `qbo_sync_error` | TEXT | Error message if failed |

### QBO Auth Tokens

| Column | Type | Purpose |
|--------|------|---------|
| `realm_id` | TEXT | QBO Company ID |
| `company_name` | TEXT | QBO Company name |
| `access_token` | TEXT | OAuth access token |
| `refresh_token` | TEXT | OAuth refresh token |
| `access_token_expires_at` | TIMESTAMPTZ | Token expiry |

### QBO Customer Mapping

| Column | Type | Purpose |
|--------|------|---------|
| `contact_id` | UUID | Unicorn contact ID |
| `qbo_customer_id` | TEXT | QBO Customer ID |
| `qbo_display_name` | TEXT | Customer name in QBO |

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/qbo/auth` | GET | Initiate OAuth flow |
| `/api/qbo/callback` | GET | OAuth callback handler |
| `/api/qbo/create-invoice` | POST | Create invoice from ticket |
| `/api/qbo/customers` | GET/POST | Search/create customers |

---

## Invoice Line Items

The invoice is built from:

1. **Labor** (from `service_time_logs`)
   - Description: "Service Labor - [ticket title]"
   - Quantity: Total hours
   - Rate: `ticket.hourly_rate` or default $150/hr

2. **Parts** (from `service_ticket_parts`)
   - Description: Part name
   - Quantity: `quantity_needed`
   - Rate: `unit_cost`

---

## Files

| Purpose | File |
|---------|------|
| Frontend service | `src/services/quickbooksService.js` |
| OAuth initiate | `api/qbo/auth.js` |
| OAuth callback | `api/qbo/callback.js` |
| Create invoice | `api/qbo/create-invoice.js` |
| Customer search | `api/qbo/customers.js` |
| Database migration | `database/migrations/20251229_quickbooks_integration.sql` |
