/**
 * Microsoft Graph Subscription Management API
 *
 * Creates and manages webhook subscriptions for calendar event changes.
 * Subscriptions notify us when attendees accept/decline calendar invites.
 *
 * Endpoints:
 * - POST: Create a new subscription for a user's calendar
 * - GET: List active subscriptions
 * - DELETE: Remove a subscription
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Initialize Supabase with service role
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
    const error = await response.text();
    throw new Error(`Failed to get app token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Generate webhook URL based on environment
function getWebhookUrl() {
  // Use production URL or fallback
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'https://unicorn-one.vercel.app';

  return `${baseUrl}/api/webhooks/graph-calendar`;
}

// Create a subscription for a user's calendar events
async function createSubscription(userId, userEmail, token) {
  // Generate a random client state for validation
  const clientState = crypto.randomBytes(32).toString('hex');

  // Subscriptions expire after max 3 days for calendar resources
  const expirationDateTime = new Date();
  expirationDateTime.setDate(expirationDateTime.getDate() + 2); // 2 days to be safe

  const subscriptionPayload = {
    changeType: 'updated,deleted',
    notificationUrl: getWebhookUrl(),
    resource: `/users/${userId}/calendar/events`,
    expirationDateTime: expirationDateTime.toISOString(),
    clientState: clientState
  };

  console.log(`[GraphSubscription] Creating subscription for user ${userId}`);
  console.log(`[GraphSubscription] Webhook URL: ${subscriptionPayload.notificationUrl}`);

  const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(subscriptionPayload)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[GraphSubscription] Failed to create:`, error);
    throw new Error(`Failed to create subscription: ${error}`);
  }

  const subscription = await response.json();
  console.log(`[GraphSubscription] Created subscription ${subscription.id}`);

  // Store in database
  const { error: dbError } = await supabase
    .from('graph_subscriptions')
    .insert({
      user_id: userId,
      user_email: userEmail,
      subscription_id: subscription.id,
      resource: subscriptionPayload.resource,
      change_types: ['updated', 'deleted'],
      notification_url: subscriptionPayload.notificationUrl,
      client_state: clientState,
      expires_at: subscription.expirationDateTime,
      status: 'active'
    });

  if (dbError) {
    console.error(`[GraphSubscription] Failed to store in DB:`, dbError);
    // Try to delete the subscription from Graph since we couldn't store it
    await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscription.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    throw new Error(`Failed to store subscription: ${dbError.message}`);
  }

  return subscription;
}

// Renew an existing subscription
async function renewSubscription(subscriptionId, token) {
  const expirationDateTime = new Date();
  expirationDateTime.setDate(expirationDateTime.getDate() + 2);

  const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expirationDateTime: expirationDateTime.toISOString()
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to renew subscription: ${error}`);
  }

  const subscription = await response.json();

  // Update expiration in database
  await supabase
    .from('graph_subscriptions')
    .update({
      expires_at: subscription.expirationDateTime,
      last_renewed_at: new Date().toISOString(),
      error_count: 0,
      error_message: null
    })
    .eq('subscription_id', subscriptionId);

  return subscription;
}

// Delete a subscription
async function deleteSubscription(subscriptionId, token) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  // 204 No Content is success, 404 means already deleted
  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete subscription: ${error}`);
  }

  // Mark as deleted in database
  await supabase
    .from('graph_subscriptions')
    .update({ status: 'deleted' })
    .eq('subscription_id', subscriptionId);

  return { deleted: true };
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const token = await getAppToken();

    // POST - Create new subscription
    if (req.method === 'POST') {
      const { userId, userEmail } = req.body;

      if (!userId || !userEmail) {
        return res.status(400).json({ error: 'userId and userEmail are required' });
      }

      // Check if active subscription already exists
      const { data: existing } = await supabase
        .from('graph_subscriptions')
        .select('subscription_id, expires_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (existing) {
        // Check if it needs renewal (expires within 12 hours)
        const expiresAt = new Date(existing.expires_at);
        const hoursUntilExpiry = (expiresAt - new Date()) / (1000 * 60 * 60);

        if (hoursUntilExpiry > 12) {
          return res.status(200).json({
            message: 'Subscription already exists',
            subscriptionId: existing.subscription_id,
            expiresAt: existing.expires_at
          });
        }

        // Renew the subscription
        const renewed = await renewSubscription(existing.subscription_id, token);
        return res.status(200).json({
          message: 'Subscription renewed',
          subscriptionId: renewed.id,
          expiresAt: renewed.expirationDateTime
        });
      }

      // Create new subscription
      const subscription = await createSubscription(userId, userEmail, token);
      return res.status(201).json({
        message: 'Subscription created',
        subscriptionId: subscription.id,
        expiresAt: subscription.expirationDateTime
      });
    }

    // GET - List subscriptions
    if (req.method === 'GET') {
      const { userId } = req.query;

      let query = supabase
        .from('graph_subscriptions')
        .select('*')
        .eq('status', 'active');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return res.status(200).json({ subscriptions: data });
    }

    // DELETE - Remove subscription
    if (req.method === 'DELETE') {
      const { subscriptionId } = req.query;

      if (!subscriptionId) {
        return res.status(400).json({ error: 'subscriptionId is required' });
      }

      await deleteSubscription(subscriptionId, token);
      return res.status(200).json({ message: 'Subscription deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[GraphSubscription] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
