const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_DAYS = parseInt(process.env.PUBLIC_SHADE_SESSION_DAYS || '365', 10);
const OTP_TTL_DAYS = parseInt(process.env.PUBLIC_SHADE_OTP_TTL_DAYS || '365', 10);

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
    .select('company_name, company_logo_url, orders_contact_name, orders_contact_email, orders_contact_phone')
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function fetchProject(projectId) {
  if (!projectId) return null;
  const { data } = await supabase
    .from('projects')
    .select('id, name, code, stage, address, city, state, postal_code, customer_name')
    .eq('id', projectId)
    .maybeSingle();
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

  if (link.revoked_at) {
    return { status: 'revoked', reason: 'link_revoked' };
  }

  const [project, company] = await Promise.all([
    fetchProject(link.project_id),
    fetchCompanySettings()
  ]);

  if (!project) {
    return { status: 'invalid', reason: 'project_missing' };
  }

  const base = {
    status: sessionValid ? 'verified' : 'needs_verification',
    session: {
      valid: sessionValid,
      expiresAt: link.session_expires_at || null
    },
    project: {
      id: project.id,
      name: project.name,
      code: project.code,
      stage: project.stage,
      address: project.address,
      city: project.city,
      state: project.state,
      postalCode: project.postal_code,
      customerName: project.customer_name
    },
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
