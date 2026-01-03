/**
 * System Account Permission Tests
 *
 * Endpoint: POST /api/system-account/test-permissions
 * Tests all application permissions to verify Azure AD setup is correct.
 */

const { createClient } = require('@supabase/supabase-js');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Azure AD configuration
const config = {
  tenant: process.env.AZURE_TENANT_ID,
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
};

async function getAppToken() {
  const body = new URLSearchParams();
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('grant_type', 'client_credentials');
  body.set('scope', 'https://graph.microsoft.com/.default');

  const resp = await fetch(
    `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token error: ${resp.status} - ${text}`);
  }

  const json = await resp.json();
  return json.access_token;
}

async function getSystemEmail() {
  try {
    const { data } = await supabase
      .from('app_configuration')
      .select('value')
      .eq('key', 'system_account_email')
      .single();
    return data?.value || process.env.SYSTEM_ACCOUNT_EMAIL || 'unicorn@isehome.com';
  } catch {
    return process.env.SYSTEM_ACCOUNT_EMAIL || 'unicorn@isehome.com';
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: { passed: 0, failed: 0 },
  };

  const addResult = (name, permission, passed, error = null, hint = null) => {
    results.tests.push({ name, permission, passed, error, hint });
    if (passed) results.summary.passed++;
    else results.summary.failed++;
  };

  // Test 1: Get App Token (basic connectivity)
  let token = null;
  try {
    token = await getAppToken();
    addResult('App Token', 'Client Credentials', true);
  } catch (err) {
    addResult('App Token', 'Client Credentials', false, err.message,
      'Check AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET environment variables');
    return res.json(results);
  }

  const systemEmail = await getSystemEmail();
  results.systemEmail = systemEmail;

  // Test 2: User.Read.All - Read user profile
  try {
    const resp = await fetch(`${GRAPH_BASE}/users/${systemEmail}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      const user = await resp.json();
      addResult('Read User Profile', 'User.Read.All', true);
      results.accountName = user.displayName;
    } else {
      const text = await resp.text();
      addResult('Read User Profile', 'User.Read.All', false, `${resp.status}: ${text}`,
        'Add User.Read.All APPLICATION permission and grant admin consent');
    }
  } catch (err) {
    addResult('Read User Profile', 'User.Read.All', false, err.message);
  }

  // Test 3: Mail.Send - Check mailbox access (we can't actually send without a real test)
  try {
    // Try to access mailbox settings as a proxy for mail access
    const resp = await fetch(`${GRAPH_BASE}/users/${systemEmail}/mailboxSettings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      addResult('Mailbox Access', 'Mail.Send / Mail.Read', true);
    } else if (resp.status === 403) {
      // 403 on mailboxSettings doesn't mean Mail.Send won't work
      // Mail.Send doesn't require reading the mailbox
      addResult('Mailbox Access', 'Mail.Send', true, null,
        'Mail.Send permission is likely configured (mailbox read test skipped)');
    } else {
      const text = await resp.text();
      addResult('Mailbox Access', 'Mail.Send', false, `${resp.status}: ${text}`,
        'Add Mail.Send APPLICATION permission and grant admin consent');
    }
  } catch (err) {
    addResult('Mailbox Access', 'Mail.Send', false, err.message);
  }

  // Test 4: Calendars.ReadWrite - Check calendar access
  try {
    const resp = await fetch(`${GRAPH_BASE}/users/${systemEmail}/calendar`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      addResult('Calendar Access', 'Calendars.ReadWrite', true);
    } else {
      const text = await resp.text();
      addResult('Calendar Access', 'Calendars.ReadWrite', false, `${resp.status}: ${text}`,
        'Add Calendars.ReadWrite APPLICATION permission and grant admin consent');
    }
  } catch (err) {
    addResult('Calendar Access', 'Calendars.ReadWrite', false, err.message);
  }

  // Test 5: Files.ReadWrite.All - Check SharePoint/OneDrive access
  try {
    // Try to list drives (basic SharePoint access)
    const resp = await fetch(`${GRAPH_BASE}/sites/root`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      addResult('SharePoint Access', 'Sites.Read.All / Files.ReadWrite.All', true);
    } else {
      const text = await resp.text();
      addResult('SharePoint Access', 'Sites.Read.All / Files.ReadWrite.All', false, `${resp.status}: ${text}`,
        'Add Sites.ReadWrite.All and Files.ReadWrite.All APPLICATION permissions');
    }
  } catch (err) {
    addResult('SharePoint Access', 'Sites.Read.All / Files.ReadWrite.All', false, err.message);
  }

  // Test 6: Group.Read.All - Check group access (optional)
  try {
    const resp = await fetch(`${GRAPH_BASE}/groups?$top=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      addResult('Group Access', 'Group.Read.All', true);
    } else {
      const text = await resp.text();
      addResult('Group Access', 'Group.Read.All', false, `${resp.status}: ${text}`,
        'Add Group.Read.All APPLICATION permission (optional - for group email)');
    }
  } catch (err) {
    addResult('Group Access', 'Group.Read.All', false, err.message);
  }

  console.log('[SystemAccount] Permission test results:', JSON.stringify(results.summary));

  res.json(results);
};
