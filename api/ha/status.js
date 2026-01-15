/**
 * api/ha/status.js
 * Check Home Assistant connection status for a project
 * GET /api/ha/status?project_id=xxx
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { project_id } = req.query;

  if (!project_id) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  try {
    // Get HA credentials from decrypted view
    console.log('[HA Status] Querying for project_id:', project_id);

    const { data: haConfig, error: dbError } = await supabase
      .from('project_home_assistant_decrypted')
      .select('*')
      .eq('project_id', project_id)
      .single();

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('[HA Status] DB error:', dbError);
      return res.status(500).json({ error: 'Database error', details: dbError.message });
    }

    if (!haConfig) {
      return res.json({
        connected: false,
        configured: false,
        message: 'Home Assistant not configured for this project'
      });
    }

    // Debug: Log what we got from the database
    console.log('[HA Status] Config from DB:', {
      id: haConfig.id,
      project_id: haConfig.project_id,
      ha_url: haConfig.ha_url ? `${haConfig.ha_url.substring(0, 30)}...` : 'NULL',
      ha_url_length: haConfig.ha_url?.length,
      access_token: haConfig.access_token ? '[REDACTED]' : 'NULL',
      instance_name: haConfig.instance_name
    });

    console.log('[HA Status] Testing connection to:', haConfig.ha_url);
    console.log('[HA Status] URL type:', typeof haConfig.ha_url, 'Length:', haConfig.ha_url?.length);

    // Validate URL before attempting fetch
    if (!haConfig.ha_url || typeof haConfig.ha_url !== 'string') {
      return res.json({
        connected: false,
        configured: true,
        error: 'Invalid URL in database - URL is empty or not a string',
        instance_name: haConfig.instance_name
      });
    }

    // Build the full URL and validate it
    let fullUrl;
    try {
      fullUrl = new URL('/api/', haConfig.ha_url).toString();
      console.log('[HA Status] Full URL to fetch:', fullUrl);
    } catch (urlError) {
      console.error('[HA Status] Invalid URL format:', urlError.message);
      return res.json({
        connected: false,
        configured: true,
        error: `Invalid URL format: ${haConfig.ha_url}`,
        instance_name: haConfig.instance_name
      });
    }

    // Call Home Assistant API root endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let haResponse;
    try {
      haResponse = await fetch(fullUrl, {
        headers: {
          'Authorization': `Bearer ${haConfig.access_token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
    } catch (fetchError) {
      clearTimeout(timeout);

      // Update error status in database
      await supabase.rpc('update_project_home_assistant', {
        p_project_id: project_id,
        p_last_error: fetchError.name === 'AbortError' ? 'Connection timeout' : fetchError.message
      }).catch(() => {});

      return res.json({
        connected: false,
        configured: true,
        error: fetchError.name === 'AbortError' ? 'Connection timeout' : fetchError.message,
        instance_name: haConfig.instance_name
      });
    }

    clearTimeout(timeout);

    if (!haResponse.ok) {
      // Update error status in database
      await supabase.rpc('update_project_home_assistant', {
        p_project_id: project_id,
        p_last_error: `HTTP ${haResponse.status}: ${haResponse.statusText}`
      }).catch(() => {});

      return res.json({
        connected: false,
        configured: true,
        error: `HA returned ${haResponse.status}: ${haResponse.statusText}`,
        instance_name: haConfig.instance_name
      });
    }

    const haData = await haResponse.json();

    // Get entity count
    let deviceCount = 0;
    try {
      const statesResponse = await fetch(`${haConfig.ha_url}/api/states`, {
        headers: {
          'Authorization': `Bearer ${haConfig.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (statesResponse.ok) {
        const states = await statesResponse.json();
        deviceCount = states.length;
      }
    } catch (statesError) {
      console.warn('[HA Status] Could not get states count:', statesError.message);
    }

    // Update success status in database
    await supabase.rpc('update_project_home_assistant', {
      p_project_id: project_id,
      p_last_connected_at: new Date().toISOString(),
      p_last_error: null,
      p_device_count: deviceCount
    }).catch((err) => {
      console.warn('[HA Status] Could not update status:', err.message);
    });

    console.log('[HA Status] Connected! Version:', haData.version, 'Entities:', deviceCount);

    return res.json({
      connected: true,
      configured: true,
      instance_name: haConfig.instance_name,
      ha_version: haData.version,
      device_count: deviceCount,
      last_connected: new Date().toISOString()
    });

  } catch (error) {
    console.error('[HA Status] Unhandled error:', error);
    console.error('[HA Status] Error stack:', error.stack);

    // Update error status
    if (project_id) {
      await supabase.rpc('update_project_home_assistant', {
        p_project_id: project_id,
        p_last_error: error.message
      }).catch(() => {});
    }

    return res.status(500).json({
      connected: false,
      configured: true,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
