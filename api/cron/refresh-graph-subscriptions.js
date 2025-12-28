/**
 * Cron Job: Refresh Graph Subscriptions
 *
 * Microsoft Graph subscriptions expire after ~3 days max.
 * This job renews subscriptions before they expire.
 *
 * Schedule: Once daily (e.g., 3 AM)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get app-only access token for Graph API
async function getAppToken() {
  const tokenUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error(`Failed to get app token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Renew a subscription
async function renewSubscription(token, subscriptionId) {
  // Extend by 2 days (max is ~3 days for calendar)
  const expirationDateTime = new Date();
  expirationDateTime.setDate(expirationDateTime.getDate() + 2);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        expirationDateTime: expirationDateTime.toISOString()
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to renew: ${errorText}`);
  }

  return response.json();
}

// Check if a subscription still exists in Graph
async function checkSubscriptionExists(token, subscriptionId) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  return response.ok;
}

module.exports = async (req, res) => {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('[RefreshSubscriptions] Starting subscription refresh');

  try {
    const token = await getAppToken();

    // Find subscriptions expiring within 24 hours
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() + 24);

    const { data: expiringSubscriptions, error: fetchError } = await supabase
      .from('graph_subscriptions')
      .select('*')
      .eq('status', 'active')
      .lt('expires_at', cutoffTime.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    console.log(`[RefreshSubscriptions] Found ${expiringSubscriptions?.length || 0} subscriptions to renew`);

    const results = {
      renewed: 0,
      failed: 0,
      expired: 0
    };

    for (const subscription of expiringSubscriptions || []) {
      try {
        // Check if subscription still exists
        const exists = await checkSubscriptionExists(token, subscription.subscription_id);

        if (!exists) {
          console.log(`[RefreshSubscriptions] Subscription ${subscription.subscription_id} no longer exists, marking expired`);

          await supabase
            .from('graph_subscriptions')
            .update({
              status: 'expired',
              error_message: 'Subscription no longer exists in Graph'
            })
            .eq('id', subscription.id);

          results.expired++;
          continue;
        }

        // Renew the subscription
        const renewed = await renewSubscription(token, subscription.subscription_id);

        await supabase
          .from('graph_subscriptions')
          .update({
            expires_at: renewed.expirationDateTime,
            last_renewed_at: new Date().toISOString(),
            error_count: 0,
            error_message: null
          })
          .eq('id', subscription.id);

        console.log(`[RefreshSubscriptions] Renewed subscription ${subscription.subscription_id}`);
        results.renewed++;

      } catch (error) {
        console.error(`[RefreshSubscriptions] Failed to renew ${subscription.subscription_id}:`, error);

        // Increment error count
        const newErrorCount = (subscription.error_count || 0) + 1;

        await supabase
          .from('graph_subscriptions')
          .update({
            error_count: newErrorCount,
            error_message: error.message,
            last_error_at: new Date().toISOString(),
            // Mark as failed if too many errors
            status: newErrorCount >= 3 ? 'failed' : 'active'
          })
          .eq('id', subscription.id);

        results.failed++;
      }
    }

    // Also mark any subscriptions that are past their expiration as expired
    const now = new Date().toISOString();
    const { data: expiredSubs } = await supabase
      .from('graph_subscriptions')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .lt('expires_at', now)
      .select('id');

    if (expiredSubs?.length) {
      console.log(`[RefreshSubscriptions] Marked ${expiredSubs.length} expired subscriptions`);
      results.expired += expiredSubs.length;
    }

    console.log('[RefreshSubscriptions] Complete:', results);

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('[RefreshSubscriptions] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
