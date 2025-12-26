# Agent Development Guide

This document captures patterns and lessons learned for building features in this codebase.

## External Portals (Public/Unauthenticated Access)

When building external-facing portals that don't require user authentication (like `PublicIssuePortal`), follow these patterns:

### SharePoint Images & Thumbnails

**Problem**: SharePoint URLs require authentication. External users cannot access them directly.

**Solution**: Route all SharePoint images through server-side proxy endpoints that handle authentication using app-only credentials.

#### Available Endpoints

1. **`/api/sharepoint-thumbnail`** (Preferred for thumbnails)
   - Uses Microsoft Graph API to generate thumbnails
   - Requires: `driveId`, `itemId`, `size` (small/medium/large)
   - More reliable and faster than image-proxy
   - Example: `/api/sharepoint-thumbnail?driveId=xxx&itemId=yyy&size=medium`

2. **`/api/image-proxy`** (Fallback for full images or legacy data)
   - Resolves SharePoint sharing URLs and proxies the actual file
   - Requires: `url` (the SharePoint URL)
   - Works with sharing links (`:i:/g/` format)
   - Example: `/api/image-proxy?url=${encodeURIComponent(sharePointUrl)}`

#### Implementation Pattern

```jsx
// In your component
{photos.map((photo) => {
  // Use Graph API thumbnail if metadata available, otherwise fallback to image proxy
  const thumbnailUrl = photo.sharepointDriveId && photo.sharepointItemId
    ? `/api/sharepoint-thumbnail?driveId=${encodeURIComponent(photo.sharepointDriveId)}&itemId=${encodeURIComponent(photo.sharepointItemId)}&size=medium`
    : `/api/image-proxy?url=${encodeURIComponent(photo.url)}`;

  const fullUrl = `/api/image-proxy?url=${encodeURIComponent(photo.url)}`;

  return (
    <a href={fullUrl} target="_blank">
      <img src={thumbnailUrl} alt={photo.fileName} />
    </a>
  );
})}
```

#### Database Requirements

When fetching photos for external portals, include SharePoint metadata:

```js
// In your API endpoint
const { data } = await supabase
  .from('issue_photos')
  .select('id, url, file_name, sharepoint_drive_id, sharepoint_item_id, ...')
  .eq('issue_id', issueId);

// Include in response payload
base.photos = photos.map((photo) => ({
  id: photo.id,
  url: photo.url,
  fileName: photo.file_name,
  sharepointDriveId: photo.sharepoint_drive_id,  // For thumbnail API
  sharepointItemId: photo.sharepoint_item_id,    // For thumbnail API
  // ...other fields
}));
```

### Token-Based Authentication

External portals use token-based access rather than user sessions:

1. **Portal Token**: Long-lived token in URL identifying the resource
2. **OTP Verification**: 6-digit code sent via email for initial verification
3. **Session Token**: Created after OTP verification, stored in localStorage

See `src/pages/PublicIssuePortal.js` and `api/public-issue.js` for reference implementation.

### Checklist for New External Portals

- [ ] All SharePoint images routed through proxy endpoints
- [ ] SharePoint metadata (driveId, itemId) fetched from database
- [ ] Fallback to image-proxy for legacy data without metadata
- [ ] Token validation on all API endpoints
- [ ] Session management with appropriate expiry
- [ ] CORS headers configured for API endpoints
- [ ] No sensitive data exposed before verification
