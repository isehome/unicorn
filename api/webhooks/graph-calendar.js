/**
 * Microsoft Graph Calendar Webhook Endpoint
 *
 * Receives change notifications when calendar events are updated.
 * Used to detect when technicians/customers accept or decline invites.
 *
 * Flow:
 * 1. Graph sends validation request when subscription is created
 * 2. Graph sends change notifications when events are modified
 * 3. We queue notifications for processing by cron job
 */

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role for backend operations
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle subscription validation request
    // When creating a subscription, Graph sends a validation token that must be echoed back
    if (req.query.validationToken) {
      console.log('[GraphWebhook] Subscription validation request received');
      // Return the validation token as plain text
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(req.query.validationToken);
    }

    // Handle change notifications
    const { value: notifications } = req.body || {};

    if (!notifications || !Array.isArray(notifications)) {
      console.log('[GraphWebhook] Invalid payload received:', JSON.stringify(req.body).slice(0, 200));
      // Return 202 to prevent Graph from retrying
      return res.status(202).json({ received: true, processed: 0 });
    }

    console.log(`[GraphWebhook] Received ${notifications.length} notification(s)`);

    // Process each notification
    const results = [];

    for (const notification of notifications) {
      const {
        subscriptionId,
        changeType,
        resource,
        resourceData,
        clientState,
        tenantId
      } = notification;

      // Validate clientState if we have one stored
      // This prevents spoofed notifications
      if (clientState) {
        const { data: subscription } = await supabase
          .from('graph_subscriptions')
          .select('client_state')
          .eq('subscription_id', subscriptionId)
          .single();

        if (subscription && subscription.client_state !== clientState) {
          console.warn(`[GraphWebhook] ClientState mismatch for subscription ${subscriptionId}`);
          results.push({ subscriptionId, status: 'rejected', reason: 'clientState mismatch' });
          continue;
        }
      }

      // Extract event ID from resource URL
      // Resource format: /users/{userId}/events/{eventId} or /users/{userId}/calendar/events/{eventId}
      const eventIdMatch = resource?.match(/events\/([^/]+)/);
      const eventId = eventIdMatch ? eventIdMatch[1] : null;

      // Queue the notification for processing
      const { data, error } = await supabase
        .from('graph_change_notifications')
        .insert({
          subscription_id: subscriptionId,
          change_type: changeType,
          resource_url: resource,
          resource_id: eventId,
          tenant_id: tenantId,
          client_state: clientState,
          raw_payload: notification
        })
        .select('id')
        .single();

      if (error) {
        console.error(`[GraphWebhook] Error queuing notification:`, error);
        results.push({ subscriptionId, status: 'error', error: error.message });
      } else {
        console.log(`[GraphWebhook] Queued notification ${data.id} for event ${eventId}, changeType: ${changeType}`);
        results.push({ subscriptionId, notificationId: data.id, status: 'queued' });
      }
    }

    // Return 202 Accepted immediately
    // Graph expects a quick response; actual processing happens in cron job
    return res.status(202).json({
      received: true,
      processed: results.length,
      results
    });

  } catch (error) {
    console.error('[GraphWebhook] Unexpected error:', error);
    // Still return 202 to prevent infinite retries from Graph
    return res.status(202).json({
      received: true,
      error: 'Internal processing error'
    });
  }
};
