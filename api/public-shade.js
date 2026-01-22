const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_DAYS = parseInt(process.env.PUBLIC_SHADE_SESSION_DAYS || '365', 10);
const OTP_TTL_DAYS = parseInt(process.env.PUBLIC_SHADE_OTP_TTL_DAYS || '365', 10);
const COMMENT_MAX = 2000;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'unicorn-public-shade' } }
  })
  : null;

const nowIso = () => new Date().toISOString();
const hashSecret = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex');
const makeSessionToken = () => crypto.randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
const addDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const respond = (res, status, payload) => {
  res.status(status).json(payload);
};

async function fetchLinkByToken(token) {
  if (!token || token.length < 8) {
    console.log('[PublicShade] Token too short or missing:', { tokenLength: token?.length });
    return null;
  }

  const tokenHash = hashSecret(token);
  console.log('[PublicShade] Looking up token:', {
    tokenPreview: token.substring(0, 10) + '...',
    tokenLength: token.length,
    tokenHashFull: tokenHash // Full hash for comparison
  });

  // First, let's see what tokens exist in the database
  const { data: allLinks, error: listError } = await supabase
    .from('shade_public_access_links')
    .select('id, token_hash, created_at')
    .limit(5);

  console.log('[PublicShade] Recent links in DB:', allLinks?.map(l => ({
    id: l.id,
    hashPreview: l.token_hash?.substring(0, 20) + '...',
    created: l.created_at
  })));

  const { data, error } = await supabase
    .from('shade_public_access_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  console.log('[PublicShade] Token lookup result:', {
    found: !!data,
    error: error?.message,
    linkId: data?.id
  });

  if (error) throw error;
  return data;
}

function isSessionValid(link, sessionToken) {
  if (!link?.session_token_hash || !sessionToken) return false;
  if (!link.session_expires_at) return false;
  if (new Date(link.session_expires_at).getTime() < Date.now()) return false;
  return hashSecret(sessionToken) === link.session_token_hash;
}

async function fetchCompanySettings() {
  const { data } = await supabase
    .from('company_settings')
    .select('company_name, company_logo_url, orders_contact_name, orders_contact_email, orders_contact_phone, brand_color_primary, brand_color_secondary, brand_color_tertiary')
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function fetchProject(projectId) {
  if (!projectId) {
    console.log('[PublicShade] fetchProject: No projectId provided');
    return null;
  }

  console.log('[PublicShade] fetchProject: Looking up project:', projectId);

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, code, stage, address, city, state, postal_code, customer_name')
    .eq('id', projectId)
    .maybeSingle();

  console.log('[PublicShade] fetchProject result:', {
    found: !!data,
    error: error?.message,
    projectName: data?.name
  });

  return data || null;
}

async function fetchShades(projectId) {
  const { data, error } = await supabase
    .from('project_shades')
    .select(`
      id,
      name,
      quoted_width,
      quoted_height,
      m1_width,
      m1_height,
      m2_width,
      m2_height,
      mount_type,
      m1_mount_type,
      m2_mount_type,
      technology,
      model,
      fabric_selection,
      approval_status,
      design_review_status,
      room:project_rooms(name)
    `)
    .eq('project_id', projectId)
    .order('name');

  if (error) throw error;
  return data || [];
}

async function buildPortalPayload(link, sessionValid) {
  if (!link) {
    return { status: 'invalid', reason: 'link_not_found' };
  }

  console.log('[PublicShade] buildPortalPayload:', {
    linkId: link.id,
    projectId: link.project_id,
    revoked: !!link.revoked_at
  });

  if (link.revoked_at) {
    return { status: 'revoked', reason: 'link_revoked' };
  }

  const [project, company] = await Promise.all([
    fetchProject(link.project_id),
    fetchCompanySettings()
  ]);

  // Note: Project lookup may fail due to RLS - don't block on it
  if (!project) {
    console.log('[PublicShade] Project not found for link (RLS?):', link.project_id);
  }

  const base = {
    status: sessionValid ? 'verified' : 'needs_verification',
    session: {
      valid: sessionValid,
      expiresAt: link.session_expires_at || null
    },
    project: project ? {
      id: project.id,
      name: project.name,
      code: project.code,
      stage: project.stage,
      address: project.address,
      city: project.city,
      state: project.state,
      postalCode: project.postal_code,
      customerName: project.customer_name
    } : null,
    stakeholder: {
      name: link.contact_name,
      email: link.contact_email
    },
    company: company ? {
      name: company.company_name,
      logoUrl: company.company_logo_url,
      ordersContact: {
        name: company.orders_contact_name,
        email: company.orders_contact_email,
        phone: company.orders_contact_phone
      },
      brandColors: {
        primary: company.brand_color_primary || '#8B5CF6',
        secondary: company.brand_color_secondary || '#94AF32',
        tertiary: company.brand_color_tertiary || '#3B82F6'
      }
    } : null
  };

  if (sessionValid) {
    const shades = await fetchShades(link.project_id);

    base.shades = shades.map((shade) => ({
      id: shade.id,
      name: shade.name,
      roomName: shade.room?.name || 'Unassigned',
      // Use best available measurement: M2 > M1 > Quoted
      width: shade.m2_width || shade.m1_width || shade.quoted_width,
      height: shade.m2_height || shade.m1_height || shade.quoted_height,
      mountType: shade.m2_mount_type || shade.m1_mount_type || shade.mount_type,
      technology: shade.technology,
      model: shade.model,
      fabricSelection: shade.fabric_selection,
      approvalStatus: shade.approval_status,
      designReviewStatus: shade.design_review_status
    }));
  }

  return base;
}

async function handleExchange(body) {
  const { token, sessionToken } = body || {};
  if (!supabase) {
    return { status: 500, data: { error: 'Supabase not configured' } };
  }

  const link = await fetchLinkByToken(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid', reason: 'link_not_found' } };
  }

  const validSession = isSessionValid(link, sessionToken);
  const payload = await buildPortalPayload(link, validSession);
  return { status: 200, data: payload };
}

// Debug action to create a test link and return the raw URL (for troubleshooting)
async function handleDebugCreate(body) {
  const { projectId, stakeholderId, contactEmail, contactName } = body || {};

  if (!projectId) {
    return { status: 400, data: { error: 'projectId required' } };
  }

  // Generate a random token and OTP
  const token = crypto.randomBytes(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 48);
  const otp = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  const tokenHash = hashSecret(token);
  const otpHash = hashSecret(otp);
  const expiresAt = addDays(OTP_TTL_DAYS);

  console.log('[PublicShade DEBUG] Creating test link:', {
    projectId,
    stakeholderId: stakeholderId || 'test-stakeholder',
    tokenPreview: token.substring(0, 10) + '...',
    tokenHash,
    otpHash
  });

  // Delete any existing test link for this project/stakeholder
  if (stakeholderId) {
    await supabase
      .from('shade_public_access_links')
      .delete()
      .eq('project_id', projectId)
      .eq('stakeholder_id', stakeholderId);
  }

  // Insert the new link
  const { data, error } = await supabase
    .from('shade_public_access_links')
    .insert([{
      project_id: projectId,
      stakeholder_id: stakeholderId || `test-${Date.now()}`,
      contact_email: contactEmail || 'test@example.com',
      contact_name: contactName || 'Test User',
      token_hash: tokenHash,
      otp_hash: otpHash,
      otp_expires_at: expiresAt,
      session_token_hash: null,
      session_expires_at: null,
      session_version: 0,
      verification_attempts: 0,
      metadata: { debug: true },
      revoked_at: null
    }])
    .select()
    .single();

  if (error) {
    console.error('[PublicShade DEBUG] Insert failed:', error);
    return { status: 500, data: { error: error.message } };
  }

  // Verify the hash was saved correctly
  const { data: verifyData } = await supabase
    .from('shade_public_access_links')
    .select('token_hash')
    .eq('id', data.id)
    .single();

  console.log('[PublicShade DEBUG] Link created:', {
    linkId: data.id,
    savedHash: verifyData?.token_hash,
    expectedHash: tokenHash,
    hashesMatch: verifyData?.token_hash === tokenHash
  });

  return {
    status: 200,
    data: {
      success: true,
      linkId: data.id,
      token: token,
      otp: otp,
      portalUrl: `/shade-portal/${token}`,
      tokenHash: tokenHash,
      hashesMatch: verifyData?.token_hash === tokenHash
    }
  };
}

async function handleVerify(body) {
  const { token, otp } = body || {};
  if (!token || !otp) {
    return { status: 400, data: { error: 'Token and code required' } };
  }

  const link = await fetchLinkByToken(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid', reason: 'link_not_found' } };
  }

  if (link.revoked_at) {
    return { status: 403, data: { status: 'revoked' } };
  }

  if (link.otp_expires_at && new Date(link.otp_expires_at).getTime() < Date.now()) {
    return { status: 403, data: { status: 'otp_expired' } };
  }

  const otpHash = hashSecret(String(otp).trim());
  if (otpHash !== link.otp_hash) {
    const attempts = (link.verification_attempts || 0) + 1;
    await supabase
      .from('shade_public_access_links')
      .update({
        verification_attempts: attempts,
        revoked_at: attempts >= 5 ? nowIso() : link.revoked_at
      })
      .eq('id', link.id);
    return { status: 403, data: { status: 'invalid_code' } };
  }

  const sessionToken = makeSessionToken();
  const sessionExpires = addDays(SESSION_DAYS);
  const { data, error } = await supabase
    .from('shade_public_access_links')
    .update({
      session_token_hash: hashSecret(sessionToken),
      session_expires_at: sessionExpires,
      session_version: (link.session_version || 0) + 1,
      verification_attempts: 0,
      updated_at: nowIso()
    })
    .eq('id', link.id)
    .select()
    .maybeSingle();

  if (error) {
    return { status: 500, data: { error: error.message } };
  }

  const payload = await buildPortalPayload(data, true);
  payload.sessionToken = sessionToken;
  payload.session = {
    valid: true,
    expiresAt: sessionExpires
  };
  return { status: 200, data: payload };
}

// Fetch comments for a shade (only non-internal for external portal)
async function fetchShadeComments(shadeId) {
  const { data, error } = await supabase
    .from('shade_comments')
    .select('*')
    .eq('shade_id', shadeId)
    .eq('is_internal', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[PublicShade] Error fetching comments:', error);
    return [];
  }
  return data || [];
}

// Handle shade approval from external portal
async function handleApprove(body) {
  const { token, sessionToken, shadeId } = body || {};

  if (!shadeId) {
    return { status: 400, data: { error: 'Shade ID required' } };
  }

  const link = await fetchLinkByToken(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid', reason: 'link_not_found' } };
  }

  if (!isSessionValid(link, sessionToken)) {
    return { status: 401, data: { error: 'Session expired' } };
  }

  // Verify the shade belongs to this project
  const { data: shade, error: shadeError } = await supabase
    .from('project_shades')
    .select('id, project_id, approval_status')
    .eq('id', shadeId)
    .eq('project_id', link.project_id)
    .maybeSingle();

  if (shadeError || !shade) {
    return { status: 404, data: { error: 'Shade not found or not in this project' } };
  }

  // Update the shade approval status
  const { error: updateError } = await supabase
    .from('project_shades')
    .update({
      approval_status: 'approved',
      approved_at: nowIso(),
      approved_by: link.contact_name || 'External Stakeholder',
      approved_by_email: link.contact_email
    })
    .eq('id', shadeId);

  if (updateError) {
    console.error('[PublicShade] Error approving shade:', updateError);
    return { status: 500, data: { error: 'Failed to approve shade' } };
  }

  // Check if all shades for this project are now approved
  const { data: allShades } = await supabase
    .from('project_shades')
    .select('id, approval_status')
    .eq('project_id', link.project_id);

  const allApproved = allShades?.every(s => s.approval_status === 'approved');

  if (allApproved && allShades?.length > 0) {
    // Update project-level approval tracking and flag for notification
    await supabase
      .from('projects')
      .update({
        shades_approved_at: nowIso(),
        shades_approved_by: link.contact_name || 'External Stakeholder',
        shades_approved_by_email: link.contact_email,
        shades_approval_notification_pending: true
      })
      .eq('id', link.project_id);

    console.log('[PublicShade] All shades approved for project:', link.project_id);
  }

  // Return updated payload
  const payload = await buildPortalPayload(link, true);
  payload.allApproved = allApproved;
  return { status: 200, data: payload };
}

// Handle shade unapproval from external portal
async function handleUnapprove(body) {
  const { token, sessionToken, shadeId } = body || {};

  if (!shadeId) {
    return { status: 400, data: { error: 'Shade ID required' } };
  }

  const link = await fetchLinkByToken(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid', reason: 'link_not_found' } };
  }

  if (!isSessionValid(link, sessionToken)) {
    return { status: 401, data: { error: 'Session expired' } };
  }

  // Verify the shade belongs to this project
  const { data: shade, error: shadeError } = await supabase
    .from('project_shades')
    .select('id, project_id, approval_status')
    .eq('id', shadeId)
    .eq('project_id', link.project_id)
    .maybeSingle();

  if (shadeError || !shade) {
    return { status: 404, data: { error: 'Shade not found or not in this project' } };
  }

  // Update the shade approval status back to pending
  const { error: updateError } = await supabase
    .from('project_shades')
    .update({
      approval_status: 'pending',
      approved_at: null,
      approved_by: null,
      approved_by_email: null
    })
    .eq('id', shadeId);

  if (updateError) {
    console.error('[PublicShade] Error unapproving shade:', updateError);
    return { status: 500, data: { error: 'Failed to undo approval' } };
  }

  // Clear project-level approval if it was set
  await supabase
    .from('projects')
    .update({
      shades_approved_at: null,
      shades_approved_by: null,
      shades_approved_by_email: null,
      shades_approval_notification_pending: false
    })
    .eq('id', link.project_id);

  console.log('[PublicShade] Shade unapproved:', shadeId);

  // Return updated payload
  const payload = await buildPortalPayload(link, true);
  payload.allApproved = false;
  return { status: 200, data: payload };
}

// Handle comment from external portal
async function handleComment(body) {
  const { token, sessionToken, shadeId, comment } = body || {};
  const trimmed = (comment || '').trim();

  if (!trimmed) {
    return { status: 400, data: { error: 'Comment text required' } };
  }
  if (trimmed.length > COMMENT_MAX) {
    return { status: 400, data: { error: `Comment too long (max ${COMMENT_MAX} characters)` } };
  }
  if (!shadeId) {
    return { status: 400, data: { error: 'Shade ID required' } };
  }

  const link = await fetchLinkByToken(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid', reason: 'link_not_found' } };
  }

  if (!isSessionValid(link, sessionToken)) {
    return { status: 401, data: { error: 'Session expired' } };
  }

  // Verify the shade belongs to this project
  const { data: shade, error: shadeError } = await supabase
    .from('project_shades')
    .select('id, project_id')
    .eq('id', shadeId)
    .eq('project_id', link.project_id)
    .maybeSingle();

  if (shadeError || !shade) {
    return { status: 404, data: { error: 'Shade not found or not in this project' } };
  }

  // Insert the comment (external comments are NOT internal)
  const { data: newComment, error: insertError } = await supabase
    .from('shade_comments')
    .insert([{
      shade_id: shadeId,
      project_id: link.project_id,
      comment_text: trimmed,
      is_internal: false,
      author_name: link.contact_name || 'External Stakeholder',
      author_email: link.contact_email,
      notification_pending: true
    }])
    .select()
    .maybeSingle();

  if (insertError) {
    console.error('[PublicShade] Error adding comment:', insertError);
    return { status: 500, data: { error: 'Failed to add comment' } };
  }

  // Return the updated shade comments
  const comments = await fetchShadeComments(shadeId);
  return {
    status: 200,
    data: {
      success: true,
      comment: newComment,
      comments: comments.map(c => ({
        id: c.id,
        text: c.comment_text,
        author: c.author_name,
        email: c.author_email,
        createdAt: c.created_at
      }))
    }
  };
}

// Fetch comments for all shades in a project (for portal display)
async function handleGetComments(body) {
  const { token, sessionToken, shadeId } = body || {};

  const link = await fetchLinkByToken(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid', reason: 'link_not_found' } };
  }

  if (!isSessionValid(link, sessionToken)) {
    return { status: 401, data: { error: 'Session expired' } };
  }

  if (shadeId) {
    // Get comments for a specific shade
    const comments = await fetchShadeComments(shadeId);
    return {
      status: 200,
      data: {
        comments: comments.map(c => ({
          id: c.id,
          text: c.comment_text,
          author: c.author_name,
          email: c.author_email,
          createdAt: c.created_at
        }))
      }
    };
  }

  // Get all comments for all shades in the project
  const { data: allComments, error } = await supabase
    .from('shade_comments')
    .select('*')
    .eq('project_id', link.project_id)
    .eq('is_internal', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[PublicShade] Error fetching all comments:', error);
    return { status: 500, data: { error: 'Failed to fetch comments' } };
  }

  // Group by shade_id
  const commentsByShade = (allComments || []).reduce((acc, c) => {
    if (!acc[c.shade_id]) acc[c.shade_id] = [];
    acc[c.shade_id].push({
      id: c.id,
      text: c.comment_text,
      author: c.author_name,
      email: c.author_email,
      createdAt: c.created_at
    });
    return acc;
  }, {});

  return { status: 200, data: { commentsByShade } };
}

module.exports = async (req, res) => {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    respond(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!supabase) {
    respond(res, 500, { error: 'Supabase service key missing' });
    return;
  }

  try {
    const { action } = req.body || {};
    let result;
    switch (action) {
      case 'exchange':
        result = await handleExchange(req.body);
        break;
      case 'verify':
        result = await handleVerify(req.body);
        break;
      case 'debug_create':
        // Creates a test link and returns the raw URL - for troubleshooting only
        result = await handleDebugCreate(req.body);
        break;
      case 'debug_project':
        // Direct project lookup test
        {
          const { projectId } = req.body || {};
          const project = await fetchProject(projectId);
          result = { status: 200, data: { projectFound: !!project, project } };
        }
        break;
      case 'approve':
        result = await handleApprove(req.body);
        break;
      case 'unapprove':
        result = await handleUnapprove(req.body);
        break;
      case 'comment':
        result = await handleComment(req.body);
        break;
      case 'get_comments':
        result = await handleGetComments(req.body);
        break;
      default:
        respond(res, 400, { error: 'Unknown action' });
        return;
    }

    respond(res, result.status, result.data);
  } catch (error) {
    console.error('[PublicShade] Request failed:', error);
    respond(res, 500, { error: error.message || 'Unexpected error' });
  }
};
