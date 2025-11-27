const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendGraphEmail, isGraphConfigured } = require('./_graphMail');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || process.env.APP_BASE_URL || null;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { 'x-client-info': 'unicorn-public-po' } }
    })
  : null;

const hashSecret = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex');
const nowIso = () => new Date().toISOString();

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function fetchPoLink(token) {
  if (!token) return null;
  const tokenHash = hashSecret(token);
  const { data, error } = await supabase
    .from('po_public_access_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchPurchaseOrder(poId) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, project_id, supplier_id, po_number, status, order_date, expected_delivery_date, project:projects(id,name), supplier:suppliers(id,name,email)')
    .eq('id', poId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchTracking(poId) {
  const { data, error } = await supabase
    .from('shipment_tracking')
    .select('id, tracking_number, carrier, carrier_service, status, shipped_date, estimated_delivery_date, notes, created_at')
    .eq('po_id', poId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchCompanySettings() {
  const { data } = await supabase
    .from('company_settings')
    .select('company_name, company_logo_url, orders_contact_name, orders_contact_email, orders_contact_phone')
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function buildPortalPayload(link) {
  if (!link) {
    return { status: 'invalid' };
  }

  if (link.revoked_at) {
    return { status: 'revoked' };
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { status: 'expired' };
  }

  const [po, tracking, company] = await Promise.all([
    fetchPurchaseOrder(link.purchase_order_id),
    fetchTracking(link.purchase_order_id),
    fetchCompanySettings()
  ]);

  if (!po) {
    return { status: 'invalid' };
  }

  return {
    status: 'ok',
    purchaseOrder: {
      id: po.id,
      number: po.po_number,
      status: po.status,
      orderDate: po.order_date,
      expectedDeliveryDate: po.expected_delivery_date,
      project: po.project ? {
        id: po.project.id,
        name: po.project.name
      } : null,
      supplier: po.supplier ? {
        id: po.supplier.id,
        name: po.supplier.name,
        email: po.supplier.email
      } : null
    },
    tracking: tracking.map((entry) => ({
      id: entry.id,
      trackingNumber: entry.tracking_number,
      carrier: entry.carrier,
      service: entry.carrier_service,
      status: entry.status,
      shippedDate: entry.shipped_date,
      eta: entry.estimated_delivery_date,
      notes: entry.notes,
      createdAt: entry.created_at
    })),
    company: company ? {
      name: company.company_name,
      logoUrl: company.company_logo_url,
      contact: {
        name: company.orders_contact_name,
        email: company.orders_contact_email,
        phone: company.orders_contact_phone
      }
    } : null
  };
}

async function notifyTracking(po, project, submissions) {
  if (!isGraphConfigured()) return;
  const { data: stakeholders } = await supabase
    .from('project_stakeholders_detailed')
    .select('project_id, contact_name, email, role_category')
    .eq('project_id', po.project_id)
    .eq('role_category', 'internal');

  const recipients = new Set();
  (stakeholders || []).forEach((item) => {
    if (item?.email) recipients.add(item.email.trim());
  });

  if (recipients.size === 0) return;

  const subject = `Vendor tracking added for PO ${po.po_number}`;
  const listHtml = submissions.map((entry) => `<li><strong>${entry.carrier}</strong> ${entry.tracking_number}${entry.notes ? ` – ${entry.notes}` : ''}</li>`).join('');
  const listText = submissions.map((entry) => `• ${entry.carrier} ${entry.tracking_number}${entry.notes ? ` – ${entry.notes}` : ''}`).join('\n');
  const poUrl = PUBLIC_SITE_URL ? `${PUBLIC_SITE_URL}/projects/${po.project_id}/procurement` : null;
  const html = `
    <p>New tracking numbers have been submitted for PO <strong>${po.po_number}</strong>${project?.name ? ` on ${project.name}` : ''}:</p>
    <ul>${listHtml}</ul>
    ${poUrl ? `<p><a href="${poUrl}">Open the procurement view</a> to review.</p>` : ''}
  `;
  const text = `New tracking numbers submitted for PO ${po.po_number}${project?.name ? ` on ${project.name}` : ''}:
${listText}
${poUrl ? `\n${poUrl}` : ''}`;

  await sendGraphEmail({
    to: Array.from(recipients),
    subject,
    html,
    text
  });
}

async function handleCreateLink(body) {
  const { poId, projectId, supplierId, supplierName, supplierEmail } = body || {};

  if (!poId || !projectId) {
    return { status: 400, data: { error: 'Missing PO context (poId, projectId required)' } };
  }

  // Generate a secure token
  const token = crypto.randomBytes(27).toString('base64url'); // 36 chars
  const tokenHash = hashSecret(token);

  // Check if link already exists for this PO
  const { data: existing } = await supabase
    .from('po_public_access_links')
    .select('id, token_hash')
    .eq('purchase_order_id', poId)
    .maybeSingle();

  let linkId;
  if (existing) {
    // Update existing link with new token
    const { data, error } = await supabase
      .from('po_public_access_links')
      .update({
        token_hash: tokenHash,
        supplier_id: supplierId || null,
        contact_name: supplierName || null,
        contact_email: supplierEmail || null,
        updated_at: nowIso()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('[PublicPO] Failed to update link:', error);
      return { status: 500, data: { error: 'Failed to update portal link' } };
    }
    linkId = data.id;
  } else {
    // Create new link
    const { data, error } = await supabase
      .from('po_public_access_links')
      .insert([{
        purchase_order_id: poId,
        project_id: projectId,
        supplier_id: supplierId || null,
        contact_name: supplierName || null,
        contact_email: supplierEmail || null,
        token_hash: tokenHash,
        reminders_paused: false
      }])
      .select()
      .single();

    if (error) {
      console.error('[PublicPO] Failed to create link:', error);
      return { status: 500, data: { error: 'Failed to create portal link' } };
    }
    linkId = data.id;
  }

  return {
    status: 200,
    data: {
      linkId,
      token
    }
  };
}

async function handleExchange(body) {
  const link = await fetchPoLink(body?.token);
  if (!link) {
    return { status: 404, data: { status: 'invalid' } };
  }

  const payload = await buildPortalPayload(link);
  return { status: 200, data: payload };
}

async function handleSubmit(body) {
  const { token, entries } = body || {};
  const link = await fetchPoLink(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid' } };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { status: 400, data: { error: 'Tracking entries required' } };
  }

  // Use supplier info from the link (already stored when link was created)
  const contactName = link.contact_name || 'Vendor';
  const contactEmail = link.contact_email || null;

  const po = await fetchPurchaseOrder(link.purchase_order_id);
  const cleaned = entries
    .map((entry) => ({
      carrier: (entry?.carrier || '').trim().toUpperCase().slice(0, 40),
      tracking_number: (entry?.trackingNumber || entry?.tracking_number || '').trim(),
      carrier_service: (entry?.service || entry?.carrier_service || '').trim(),
      notes: (entry?.notes || '').trim()
    }))
    .filter((entry) => entry.tracking_number && entry.carrier);

  if (cleaned.length === 0) {
    return { status: 400, data: { error: 'Valid tracking entries required' } };
  }

  const insertRows = cleaned.map((entry) => ({
    po_id: link.purchase_order_id,
    tracking_number: entry.tracking_number,
    carrier: entry.carrier,
    carrier_service: entry.carrier_service,
    status: 'pending',
    notes: entry.notes,
    added_by: null,
    shipped_date: null,
    estimated_delivery_date: null
  }));

  const { data: trackingRows, error } = await supabase
    .from('shipment_tracking')
    .insert(insertRows)
    .select();

  if (error) {
    console.error('[PublicPO] Tracking insert failed:', error);
    return { status: 500, data: { error: 'Failed to record tracking' } };
  }

  await supabase
    .from('po_public_tracking_submissions')
    .insert(cleaned.map((entry, index) => ({
      po_id: link.purchase_order_id,
      po_public_access_link_id: link.id,
      tracking_id: trackingRows?.[index]?.id || null,
      contact_name: contactName,
      contact_email: contactEmail,
      carrier: entry.carrier,
      tracking_number: entry.tracking_number,
      notes: entry.notes
    })));

  await notifyTracking(po, po.project, cleaned);
  const payload = await buildPortalPayload(link);
  return { status: 200, data: payload };
}

module.exports = async (req, res) => {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabase) {
    res.status(500).json({ error: 'Supabase not configured' });
    return;
  }

  try {
    const { action } = req.body || {};
    let result;
    switch (action) {
      case 'create-link':
        result = await handleCreateLink(req.body);
        break;
      case 'exchange':
        result = await handleExchange(req.body);
        break;
      case 'submit':
        result = await handleSubmit(req.body);
        break;
      default:
        res.status(400).json({ error: 'Unknown action' });
        return;
    }

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('[PublicPO] Request failed:', error);
    res.status(500).json({ error: error.message || 'Unexpected error' });
  }
};
