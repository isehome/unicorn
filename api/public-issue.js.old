const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { sendGraphEmail, isGraphConfigured } = require('./_graphMail');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || process.env.APP_BASE_URL || null;
const PUBLIC_ISSUE_UPLOAD_BUCKET = process.env.PUBLIC_ISSUE_UPLOAD_BUCKET || 'public-issue-uploads';
const SESSION_DAYS = parseInt(process.env.PUBLIC_ISSUE_SESSION_DAYS || '7', 10);
const OTP_TTL_DAYS = parseInt(process.env.PUBLIC_ISSUE_OTP_TTL_DAYS || '7', 10);
const MAX_UPLOAD_BYTES = parseInt(process.env.PUBLIC_ISSUE_MAX_UPLOAD_BYTES || `${8 * 1024 * 1024}`, 10);
const COMMENT_MAX = 2000;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { 'x-client-info': 'unicorn-public-issue' } }
    })
  : null;

const nowIso = () => new Date().toISOString();
const hashSecret = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex');
const sanitizeFileName = (input = '') => input.replace(/[^a-zA-Z0-9._-]/g, '_');
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
    return null;
  }

  const tokenHash = hashSecret(token);
  const { data, error } = await supabase
    .from('issue_public_access_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

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
    .select('company_name, company_logo_url, company_logo_sharepoint_drive_id, company_logo_sharepoint_item_id, orders_contact_name, orders_contact_email, orders_contact_phone')
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function fetchStakeholder(tagId) {
  if (!tagId) return null;
  const { data } = await supabase
    .from('issue_stakeholder_tags_detailed')
    .select('tag_id, contact_name, email, phone, role_name, role_category')
    .eq('tag_id', tagId)
    .maybeSingle();
  return data || null;
}

async function fetchIssueContext(issueId) {
  const { data, error } = await supabase
    .from('issues')
    .select('id, project_id, title, description, status, priority, due_date, updated_at, created_at')
    .eq('id', issueId)
    .maybeSingle();
  if (error) throw error;
  return data;
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

async function fetchComments(issueId) {
  const { data } = await supabase
    .from('issue_comments')
    .select('id, comment_text, created_at, author_name, author_email, is_internal')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function fetchUploads(linkId) {
  const { data } = await supabase
    .from('issue_external_uploads')
    .select('id, file_name, file_size, mime_type, status, submitted_at, uploaded_at, approved_at, rejected_at, rejection_reason, stakeholder_name, stakeholder_email, storage_path')
    .eq('issue_public_access_link_id', linkId)
    .order('submitted_at', { ascending: false });
  return data || [];
}

async function fetchPhotos(issueId) {
  const { data } = await supabase
    .from('issue_photos')
    .select('id, url, file_name, content_type, size_bytes, uploaded_by, created_at')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function buildPortalPayload(link, sessionValid) {
  if (!link) {
    return { status: 'invalid', reason: 'link_not_found' };
  }

  if (link.revoked_at) {
    return { status: 'revoked', reason: 'link_revoked' };
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { status: 'expired', reason: 'link_expired' };
  }

  const [issue, project, stakeholder, company] = await Promise.all([
    fetchIssueContext(link.issue_id),
    fetchProject(link.project_id),
    fetchStakeholder(link.issue_stakeholder_tag_id),
    fetchCompanySettings()
  ]);

  if (!issue) {
    return { status: 'invalid', reason: 'issue_missing' };
  }

  const base = {
    status: sessionValid ? 'verified' : 'needs_verification',
    session: {
      valid: sessionValid,
      expiresAt: link.session_expires_at || null
    },
    issue: {
      id: issue.id,
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
      dueDate: issue.due_date,
      updatedAt: issue.updated_at,
      createdAt: issue.created_at,
      ...(sessionValid ? { description: issue.description } : {})
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
    stakeholder: stakeholder ? {
      name: stakeholder.contact_name,
      email: stakeholder.email,
      role: stakeholder.role_name,
      category: stakeholder.role_category
    } : {
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
    const [comments, uploads, photos] = await Promise.all([
      fetchComments(issue.id),
      fetchUploads(link.id),
      fetchPhotos(issue.id)
    ]);

    base.comments = comments.map((comment) => ({
      id: comment.id,
      text: comment.comment_text,
      createdAt: comment.created_at,
      author: comment.author_name || 'Team Member',
      email: comment.author_email || null,
      isInternal: comment.is_internal !== false
    }));

    base.uploads = uploads.map((upload) => ({
      id: upload.id,
      fileName: upload.file_name,
      fileSize: upload.file_size,
      mimeType: upload.mime_type,
      status: upload.status,
      submittedAt: upload.submitted_at,
      uploadedAt: upload.uploaded_at,
      approvedAt: upload.approved_at,
      rejectedAt: upload.rejected_at,
      rejectionReason: upload.rejection_reason
    }));

    base.photos = photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      fileName: photo.file_name,
      contentType: photo.content_type,
      sizeBytes: photo.size_bytes,
      uploadedBy: photo.uploaded_by,
      createdAt: photo.created_at
    }));
  }

  return base;
}

async function notifyComment(link, issue, project, text) {
  if (!isGraphConfigured()) {
    return;
  }

  const { data: stakeholders } = await supabase
    .from('issue_stakeholder_tags_detailed')
    .select('contact_name, email')
    .eq('issue_id', issue.id);

  const recipients = new Set();
  (stakeholders || []).forEach((stakeholder) => {
    if (stakeholder?.email) {
      recipients.add(stakeholder.email.trim());
    }
  });

  if (recipients.size === 0) {
    return;
  }

  const actor = link.contact_name || 'External stakeholder';
  const projectName = project?.name ? ` for project ${project.name}` : '';
  const subject = `New comment on "${issue.title}"${projectName}`;
  const detailsUrl = PUBLIC_SITE_URL ? `${PUBLIC_SITE_URL}/project/${issue.project_id}/issues/${issue.id}` : null;
  const html = `
    <p><strong>${actor}</strong> left a new comment on issue <strong>${issue.title}</strong>${projectName}.</p>
    <blockquote style="border-left:4px solid #ccc;padding-left:12px;margin:12px 0;">${text.replace(/\n/g, '<br/>')}</blockquote>
    ${detailsUrl ? `<p><a href="${detailsUrl}">View the issue in Unicorn</a> for full context.</p>` : ''}
  `;
  const plain = `${actor} left a new comment on issue "${issue.title}"${projectName}.

${text}
${detailsUrl ? `
View the issue: ${detailsUrl}` : ''}`;

  await sendGraphEmail({
    to: Array.from(recipients),
    subject,
    html,
    text: plain
  });
}

async function notifyUpload(link, issue, project, upload) {
  if (!isGraphConfigured()) return;
  const { data: stakeholders } = await supabase
    .from('issue_stakeholder_tags_detailed')
    .select('contact_name, email, role_category')
    .eq('issue_id', issue.id)
    .eq('role_category', 'internal');

  const recipients = new Set();
  (stakeholders || []).forEach((stakeholder) => {
    if (stakeholder?.email) {
      recipients.add(stakeholder.email.trim());
    }
  });

  if (recipients.size === 0) return;

  const actor = link.contact_name || 'External stakeholder';
  const projectName = project?.name ? ` for project ${project.name}` : '';
  const subject = `New upload waiting on "${issue.title}"`;
  const detailsUrl = PUBLIC_SITE_URL ? `${PUBLIC_SITE_URL}/project/${issue.project_id}/issues/${issue.id}` : null;
  const html = `
    <p><strong>${actor}</strong> uploaded <em>${upload.file_name}</em> (${Math.round((upload.file_size || 0) / 1024)} KB) on issue <strong>${issue.title}</strong>${projectName}.</p>
    <p>Please review and approve it to move into SharePoint.</p>
    ${detailsUrl ? `<p><a href="${detailsUrl}">Open the issue</a> to review pending uploads.</p>` : ''}
  `;
  const plain = `${actor} uploaded ${upload.file_name} on issue "${issue.title}"${projectName}.
Please review and approve.${detailsUrl ? `\n${detailsUrl}` : ''}`;

  await sendGraphEmail({
    to: Array.from(recipients),
    subject,
    html,
    text: plain
  });
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

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { status: 403, data: { status: 'expired' } };
  }

  if (link.otp_expires_at && new Date(link.otp_expires_at).getTime() < Date.now()) {
    return { status: 403, data: { status: 'otp_expired' } };
  }

  const otpHash = hashSecret(String(otp).trim());
  if (otpHash !== link.otp_hash) {
    const attempts = (link.verification_attempts || 0) + 1;
    await supabase
      .from('issue_public_access_links')
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
    .from('issue_public_access_links')
    .update({
      session_token_hash: hashSecret(sessionToken),
      session_expires_at: sessionExpires,
      session_version: (link.session_version || 0) + 1,
      verification_attempts: 0,
      last_verified_at: nowIso(),
      otp_expires_at: addDays(OTP_TTL_DAYS)
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

async function handleComment(body) {
  const { token, sessionToken, comment } = body || {};
  const trimmed = (comment || '').trim();
  if (!trimmed) {
    return { status: 400, data: { error: 'Comment text required' } };
  }
  if (trimmed.length > COMMENT_MAX) {
    return { status: 400, data: { error: 'Comment too long' } };
  }

  const link = await fetchLinkByToken(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid' } };
  }

  if (!isSessionValid(link, sessionToken)) {
    return { status: 401, data: { error: 'Session expired' } };
  }

  const issue = await fetchIssueContext(link.issue_id);
  const project = await fetchProject(link.project_id);

  const { data, error } = await supabase
    .from('issue_comments')
    .insert([{
      issue_id: link.issue_id,
      comment_text: trimmed,
      author_name: link.contact_name || 'External stakeholder',
      author_email: link.contact_email,
      is_internal: false,
      notification_pending: true // Will be processed when internal user views the issue
    }])
    .select()
    .maybeSingle();

  if (error) {
    return { status: 500, data: { error: error.message } };
  }

  // Note: Notification will be sent by the first internal user who views this issue
  // This allows using their delegated auth token for email sending

  const payload = await buildPortalPayload(link, true);
  return { status: 200, data: payload };
}

async function handleUpload(body) {
  const { token, sessionToken, fileName, fileData, mimeType } = body || {};
  const sizeBytes = body?.fileSize || 0;
  if (!fileName || !fileData) {
    return { status: 400, data: { error: 'File payload required' } };
  }

  const link = await fetchLinkByToken(token);
  if (!link) {
    return { status: 404, data: { status: 'invalid' } };
  }

  if (!isSessionValid(link, sessionToken)) {
    return { status: 401, data: { error: 'Session expired' } };
  }

  const buffer = Buffer.from(fileData, 'base64');
  if (buffer.length === 0) {
    return { status: 400, data: { error: 'Invalid file data' } };
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { status: 413, data: { error: `File too large. Max ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1)} MB` } };
  }

  const targetName = sanitizeFileName(fileName);
  const storagePath = `pending/${link.issue_id}/${crypto.randomUUID()}-${targetName}`;
  const { error: uploadError } = await supabase
    .storage
    .from(PUBLIC_ISSUE_UPLOAD_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false
    });

  if (uploadError) {
    console.error('[PublicIssue] Storage upload failed:', {
      error: uploadError,
      bucket: PUBLIC_ISSUE_UPLOAD_BUCKET,
      path: storagePath,
      bufferSize: buffer.length
    });
    return { status: 500, data: { error: `Failed to store file: ${uploadError.message || 'Unknown error'}` } };
  }

  const { data, error } = await supabase
    .from('issue_external_uploads')
    .insert([{
      issue_id: link.issue_id,
      project_id: link.project_id,
      issue_public_access_link_id: link.id,
      stakeholder_name: link.contact_name,
      stakeholder_email: link.contact_email,
      file_name: targetName,
      file_size: buffer.length,
      mime_type: mimeType || 'application/octet-stream',
      storage_path: storagePath,
      status: 'uploaded'
    }])
    .select()
    .maybeSingle();

  if (error) {
    console.error('[PublicIssue] Failed to insert upload:', error);
    return { status: 500, data: { error: 'Failed to record upload' } };
  }

  const issue = await fetchIssueContext(link.issue_id);
  const project = await fetchProject(link.project_id);

  // Send notification but don't block upload submission if it fails
  try {
    await notifyUpload(link, issue, project, data);
  } catch (notifyError) {
    console.warn('[PublicIssue] Failed to send upload notification:', notifyError.message);
  }

  const payload = await buildPortalPayload(link, true);
  return { status: 200, data: payload };
}

async function handleDownload(body) {
  const { token, sessionToken, uploadId } = body || {};
  if (!uploadId) {
    return { status: 400, data: { error: 'Upload ID required' } };
  }

  const link = await fetchLinkByToken(token);
  if (!link) return { status: 404, data: { status: 'invalid' } };
  if (!isSessionValid(link, sessionToken)) {
    return { status: 401, data: { error: 'Session expired' } };
  }

  const { data, error } = await supabase
    .from('issue_external_uploads')
    .select('id, storage_path')
    .eq('id', uploadId)
    .eq('issue_public_access_link_id', link.id)
    .maybeSingle();

  if (error || !data) {
    return { status: 404, data: { error: 'Upload not found' } };
  }

  const { data: signed, error: urlError } = await supabase
    .storage
    .from(PUBLIC_ISSUE_UPLOAD_BUCKET)
    .createSignedUrl(data.storage_path, 60);

  if (urlError || !signed?.signedUrl) {
    return { status: 500, data: { error: 'Failed to generate link' } };
  }

  return { status: 200, data: { url: signed.signedUrl } };
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
      case 'comment':
        result = await handleComment(req.body);
        break;
      case 'upload':
        result = await handleUpload(req.body);
        break;
      case 'download':
        result = await handleDownload(req.body);
        break;
      default:
        respond(res, 400, { error: 'Unknown action' });
        return;
    }

    respond(res, result.status, result.data);
  } catch (error) {
    console.error('[PublicIssue] Request failed:', error);
    respond(res, 500, { error: error.message || 'Unexpected error' });
  }
};
