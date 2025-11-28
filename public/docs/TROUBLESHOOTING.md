# Troubleshooting Guide

## Quick Diagnosis

| Symptom | Likely Cause | Jump To |
|---------|--------------|---------|
| Can't log in | Azure config | [Authentication Issues](#authentication-issues) |
| Blank page after login | Token/redirect issue | [Authentication Issues](#authentication-issues) |
| Photos not loading | SharePoint/CORS | [Photo Issues](#photo-issues) |
| Data not saving | RLS policies | [Database Issues](#database-issues) |
| API errors | Serverless function | [API Issues](#api-issues) |
| Gauges showing wrong % | Calculation/data | [Milestone Issues](#milestone-issues) |
| Lucid import fails | API credentials | [Integration Issues](#integration-issues) |
| UniFi not connecting | API key/network | [Integration Issues](#integration-issues) |

---

## Authentication Issues

### Login Redirects But Never Completes

**Symptoms:**
- Click login, go to Microsoft, return to app, stuck loading
- Console shows token errors

**Solutions:**

1. **Check Azure Redirect URIs**
   - Go to Azure Portal → App Registration → Authentication
   - Ensure your exact URL is listed (including https://)
   - Add both production and localhost URLs

2. **Clear Browser State**
   ```javascript
   // In browser console:
   localStorage.clear();
   sessionStorage.clear();
   ```
   Then refresh and try again.

3. **Check Environment Variables**
   - Verify `REACT_APP_AZURE_CLIENT_ID` is correct
   - Verify `REACT_APP_AZURE_TENANT_ID` is correct

### "User Cancelled" or Popup Blocked

**Solution:**
- Allow popups for your domain
- Or use redirect flow instead of popup

### Token Expired Errors

**Symptoms:**
- Works initially, fails after ~1 hour
- Console shows 401 errors to Graph API

**Solution:**
- Token refresh should be automatic
- Check AuthContext for refresh logic
- Clear localStorage and re-login

---

## Database Issues

### "Permission Denied" or "RLS Policy" Errors

**Cause:** RLS policies don't include `anon` role

**Solution:**
```sql
-- Check current policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Fix: Add anon to policy
DROP POLICY IF EXISTS "policy_name" ON public.your_table;
CREATE POLICY "policy_name" ON public.your_table
FOR ALL TO anon, authenticated  -- Must include anon!
USING (true);
```

See [AUTHENTICATION.md](AUTHENTICATION.md) for why we need `anon`.

### Data Not Saving

1. **Check browser console** for error messages
2. **Check Supabase logs** in dashboard
3. **Verify RLS policies** include anon role
4. **Test in Supabase SQL Editor** directly

### "Column Does Not Exist"

**Cause:** Migration not applied

**Solution:**
1. Find the migration in `database/migrations/`
2. Run it in Supabase SQL Editor
3. Verify column exists

### Slow Queries

**Solutions:**
1. Add indexes for frequently queried columns
2. Use React Query caching
3. Limit result sets with pagination

---

## Photo Issues

### Photos Not Uploading

1. **Check SharePoint URL on project**
   - Go to project settings
   - Verify `one_drive_photos` URL is correct
   - URL should be the folder path, not file

2. **Check Microsoft Graph permissions**
   - App needs `Files.ReadWrite.All`
   - Admin consent may be required

3. **Check file size**
   - Large files may timeout
   - Consider compressing before upload

### Photos Not Displaying

1. **Broken thumbnails**
   - Clear IndexedDB cache
   - Check SharePoint permissions
   - Verify file still exists in SharePoint

2. **CORS errors**
   - Use the sharepoint-thumbnail API function
   - Don't load SharePoint images directly

3. **Wrong URL stored**
   - Check `photo_url` field in database
   - May need to re-upload

### Clearing Photo Cache
```javascript
// In browser console:
indexedDB.deleteDatabase('thumbnail-cache');
```

---

## API Issues

### Serverless Function Errors

1. **Check Vercel function logs**
   - Vercel Dashboard → Project → Functions → Logs

2. **Common errors:**
   - Missing environment variable
   - Timeout (increase in vercel.json)
   - Memory limit (increase in vercel.json)

### CORS Errors

**Symptoms:** "Access-Control-Allow-Origin" errors

**Solution:** Use proxy API functions instead of direct calls:
- `/api/unifi-proxy` for UniFi
- `/api/lucid-proxy` for Lucid
- `/api/image-proxy` for external images

### 401 Unauthorized from APIs

1. **Check API key** in environment variables
2. **Regenerate API key** if expired
3. **Verify permissions** on the API side

---

## Milestone Issues

### Gauges Showing 0% When They Shouldn't

1. **Check `required_for_prewire` flag**
   ```sql
   SELECT * FROM global_parts WHERE required_for_prewire = true;
   ```
   Parts must have this flag set for prewire gauges.

2. **Check equipment is linked**
   ```sql
   SELECT pe.*, gp.required_for_prewire
   FROM project_equipment pe
   LEFT JOIN global_parts gp ON pe.global_part_id = gp.id
   WHERE pe.project_id = 'your-project-id';
   ```

3. **Check PO status**
   - Only 'submitted', 'confirmed', 'received' POs count
   - Draft POs don't affect gauges

### Gauges Showing Wrong Percentage

1. **Refresh milestone cache**
   ```javascript
   // In component or console:
   milestoneCacheService.invalidate();
   ```

2. **Check calculation logic** in `milestoneService.js`

3. **Verify data integrity**
   - `ordered_quantity` and `received_quantity` correct
   - Wire drop stages have photos

---

## Integration Issues

### Lucid Charts

**"Failed to fetch shapes"**
1. Check Lucid API credentials
2. Verify document is shared (view access)
3. Check document URL format

**No shapes returned**
1. Document may be empty
2. Shapes may not have custom data
3. Try different page

### UniFi

**"Unauthorized" error**
1. Regenerate API key in UniFi console
2. Update `REACT_APP_UNIFI_API_KEY`
3. Redeploy

**Empty device/client list**
1. Verify site access in UniFi console
2. Check site ID is correct
3. Devices may be offline

**Connection timeout**
1. UniFi Cloud may be slow
2. Try again later
3. Check UniFi service status

### SharePoint

**"Access Denied"**
1. Check Microsoft Graph permissions
2. Verify folder exists
3. Check sharing settings on folder

**File not found**
1. File may have been moved/deleted
2. URL may be malformed
3. Check SharePoint directly

---

## Performance Issues

### Slow Initial Load

1. **Enable lazy loading** (already implemented via React.lazy)
2. **Check bundle size**: `npm run build` shows sizes
3. **Reduce dependencies** if possible

### Slow Data Loading

1. **Use React Query** for caching
2. **Add database indexes**
3. **Paginate large lists**
4. **Prefetch on hover**

### Memory Issues

1. **Check for memory leaks**
   - Unsubscribed listeners
   - Uncancelled timers
2. **Clear caches periodically**
3. **Virtualize long lists**

---

## Development Issues

### Build Fails

1. **Check console for specific error**
2. **Common fixes:**
   ```bash
   rm -rf node_modules
   npm install
   npm run build
   ```

3. **ESLint errors**: Fix or disable specific rules

### Hot Reload Not Working

1. Restart dev server
2. Check for syntax errors
3. Clear browser cache

### TypeScript/Prop Errors

- This is a JavaScript project, not TypeScript
- PropTypes can be added but aren't required
- Check component props match usage

---

## Getting Help

### Information to Gather

When asking for help, provide:

1. **Error message** (exact text)
2. **Console output** (browser dev tools)
3. **Steps to reproduce**
4. **What you expected**
5. **What actually happened**

### Useful Debug Commands

```javascript
// Check auth state
console.log(localStorage.getItem('msal.account'));

// Check Supabase connection
const { data, error } = await supabase.from('projects').select('id').limit(1);
console.log({ data, error });

// Clear all local storage
localStorage.clear();
sessionStorage.clear();
indexedDB.deleteDatabase('thumbnail-cache');
```

### Log Locations

| What | Where |
|------|-------|
| Browser errors | Browser Dev Tools → Console |
| Network requests | Browser Dev Tools → Network |
| Vercel function logs | Vercel Dashboard → Functions |
| Supabase logs | Supabase Dashboard → Logs |
| Build logs | Vercel Dashboard → Deployments |

---

*Last Updated: November 2025*