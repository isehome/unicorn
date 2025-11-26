# How to Update Lucid API Key in Vercel

## Steps to Update Your API Key

1. **Go to Vercel Dashboard**
   - Navigate to https://vercel.com
   - Click on your project: **unicorn**

2. **Access Settings**
   - Click on the **"Settings"** tab at the top

3. **Navigate to Environment Variables**
   - In the left sidebar, click on **"Environment Variables"**

4. **Find and Update the Key**
   - Look for: `REACT_APP_LUCID_API_KEY`
   - Click the three dots (⋮) next to it
   - Select **"Edit"**

5. **Paste the New Key**
   ```
   key-NDBmNzBhMWRiNWNmMmM3ZmQ4YTJlM2FhNDQ3NGE4M2JiYTA1MTQ1MjZmNzg1NGQxZDgwNDcyMTJkZTE0ODk0Yi11PTIwOTU0NDQ5MA==-vEImeiZi0XID3ARqI3Hp3xr1wNeMbEvnh4oNYNDutE8-Lucid-US
   ```

6. **Save Changes**
   - Click **"Save"**
   - The change will trigger an automatic redeployment

## Testing the New Key

After deployment (takes ~2 minutes):

1. Navigate to your app: https://unicorn-one.vercel.app
2. Click the **QR Code button** in bottom navigation (labeled "Lucid Test")
3. Enter your Lucid document URL
4. Test these functions:
   - ✅ Fetch Metadata (should still work)
   - ✅ Fetch Contents (should still work)
   - 🔄 **Download PNG** (test if this now works)
   - 🔄 **Test Embed Token** (test if this now works)

## Expected Results with New Key

If the new key has proper permissions:
- **Download PNG** should download actual images (not placeholders)
- **Embed Token** should return a valid token (not 403 error)

## Local Testing First

You can test locally before updating Vercel:
1. Restart your local dev server (Ctrl+C then `npm start`)
2. Navigate to http://localhost:3000
3. Go to the diagnostic page and test the functions
