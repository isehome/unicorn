# Issue Notification System Fix

## Date: November 15, 2025

## Problems Fixed

### 1. Duplicate Stakeholder Entries
**Problem:** The stakeholder dropdown was showing many duplicate entries (e.g., multiple "Orders (Orders) • Internal")

**Cause:** Deduplication was only happening by `assignment_id`, but the same stakeholder could have multiple assignment IDs

**Solution:** Changed deduplication logic to use the combination of:
- `contact_name`
- `role_name` 
- `category` (internal/external)

This ensures each unique person/role combination appears only once.

### 2. System Comment Notifications Not Sending
**Problem:** 
- User-added comments were sending notifications correctly
- System-generated comments (status changes) were NOT sending notifications
- This was causing stakeholders to miss important status updates

**Cause:** Authentication token handling inconsistency between user and system comments

**Solution:** 

#### For User Comments (`handleAddComment`):
- Set `is_internal: false` for user comments (they are real user comments)
- Acquire auth token via `acquireToken()`
- Pass the token to `notifyCommentActivity` with the `authToken` parameter

#### For System Comments (`appendStatusChangeComment`):
- Already acquires token via `acquireToken()`
- Already passes token to `notifyIssueComment` with proper authentication
- System comments marked with `is_internal: true`

#### Updated `notifyCommentActivity` Function:
- Now accepts `authToken` as an optional parameter
- Uses provided token or acquires a new one if not provided
- Properly marks system comments with `is_internal` flag based on text content

## How It Works Now

1. **When a user adds a comment:**
   - Comment is saved to database with `is_internal: false`
   - Auth token is acquired from the current user session
   - Notification is sent to all stakeholders using delegated auth

2. **When status changes (system comment):**
   - Status change comment is auto-generated
   - Comment is saved to database with `is_internal: true`
   - Auth token is acquired from the current user session
   - Notification is sent to all stakeholders using delegated auth
   - Email subject line reflects "Status update" vs "New comment"

## Files Modified

- `src/components/IssueDetail.js` - Fixed both stakeholder deduplication and notification authentication

## Testing

To verify the fixes:

1. **Stakeholder Dropdown:**
   - Go to any issue
   - Click "Add stakeholder" dropdown
   - Should see each stakeholder listed only once

2. **Notifications:**
   - Add a stakeholder to an issue
   - Change the issue status (Mark Blocked/Resolved)
   - Stakeholder should receive email notification
   - Add a regular comment
   - Stakeholder should receive email notification

## Key Implementation Details

The notification system uses Microsoft Graph API with both delegated and application permissions:
- **Delegated mode**: Uses the current user's auth token to send as the user or group
- **Application mode**: Falls back if no user token available

Both user comments and system comments now properly authenticate, ensuring all notifications are delivered successfully.
