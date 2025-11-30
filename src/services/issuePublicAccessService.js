import { supabase } from '../lib/supabase';
import { sharePointStorageService } from './sharePointStorageService';
import { generatePortalToken, generateOtpCode, hashSecret } from '../utils/portalTokens';

const PUBLIC_UPLOAD_BUCKET = 'public-issue-uploads';
const OTP_TTL_DAYS = 365; // Effectively never expire (until issue closed)

class IssuePublicAccessService {
  /**
   * Get or create a public access link for a stakeholder.
   * If a valid (non-revoked) link already exists, returns { linkExists: true } without regenerating.
   * Only creates a new link if none exists, to prevent invalidating existing portal URLs.
   * Links persist until the issue is resolved.
   */
  async ensureLink({ issueId, projectId, stakeholderTagId, stakeholder, forceRegenerate = false }) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!issueId || !projectId || !stakeholderTagId) {
      throw new Error('Missing issue context for public link');
    }

    // First, check if a valid (non-revoked) link already exists
    if (!forceRegenerate) {
      const { data: existingLink, error: fetchError } = await supabase
        .from('issue_public_access_links')
        .select('id, token_hash, contact_email')
        .eq('issue_stakeholder_tag_id', stakeholderTagId)
        .is('revoked_at', null)
        .maybeSingle();

      if (fetchError) {
        console.warn('[IssuePublicAccessService] Error checking for existing link:', fetchError);
      }

      // If a valid link already exists, don't regenerate - just return a flag
      if (existingLink?.id) {
        console.log('[IssuePublicAccessService] Existing valid link found, not regenerating:', {
          linkId: existingLink.id,
          stakeholderTagId
        });
        return {
          linkId: existingLink.id,
          linkExists: true,
          contactEmail: existingLink.contact_email
        };
      }
    }

    // No existing link or force regenerate - create a new one
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;

    // Generate new token and OTP
    const token = generatePortalToken();
    const otp = generateOtpCode();
    const [tokenHash, otpHash] = await Promise.all([
      hashSecret(token),
      hashSecret(otp)
    ]);
    const expiresAt = new Date(Date.now() + OTP_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const payload = {
      issue_id: issueId,
      project_id: projectId,
      issue_stakeholder_tag_id: stakeholderTagId,
      contact_email: (stakeholder?.email || '').trim().toLowerCase(),
      contact_name: stakeholder?.contact_name || stakeholder?.name || '',
      token_hash: tokenHash,
      otp_hash: otpHash,
      otp_expires_at: expiresAt,
      session_token_hash: null,
      session_expires_at: null,
      session_version: 0,
      verification_attempts: 0,
      metadata: {},
      revoked_at: null,
      created_by: userId,
      updated_by: userId
    };

    const { data, error } = await supabase
      .from('issue_public_access_links')
      .upsert([payload], {
        onConflict: 'issue_stakeholder_tag_id',
        ignoreDuplicates: false  // Ensure updates happen on conflict
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to upsert issue public link:', error);
      throw new Error('Failed to generate public share link');
    }

    // Verify the token_hash was actually saved correctly
    const { data: verifyData } = await supabase
      .from('issue_public_access_links')
      .select('token_hash')
      .eq('id', data.id)
      .single();

    console.log('[IssuePublicAccessService] Link created:', {
      linkId: data.id,
      stakeholderTagId,
      expectedHash: tokenHash.substring(0, 16) + '...',
      actualHash: verifyData?.token_hash?.substring(0, 16) + '...',
      hashMatch: verifyData?.token_hash === tokenHash
    });

    return {
      linkId: data.id,
      token,
      otp,
      contactEmail: payload.contact_email
    };
  }

  async listUploads(issueId) {
    if (!supabase) return [];
    console.log('[IssuePublicAccessService] Fetching uploads for issue:', issueId);
    const { data, error } = await supabase
      .from('issue_external_uploads')
      .select('*')
      .eq('issue_id', issueId)
      .order('submitted_at', { ascending: false });
    if (error) {
      console.error('[IssuePublicAccessService] Failed to fetch uploads:', error);
      throw error;
    }
    console.log('[IssuePublicAccessService] Found uploads:', data?.length || 0);
    return data || [];
  }

  async getSignedDownloadUrl(uploadId) {
    if (!supabase || !uploadId) return null;
    console.log('[IssuePublicAccessService] Getting signed URL for upload:', uploadId);

    const { data, error } = await supabase
      .from('issue_external_uploads')
      .select('id, storage_path')
      .eq('id', uploadId)
      .maybeSingle();

    console.log('[IssuePublicAccessService] Upload record:', { data, error });

    if (error || !data?.storage_path) {
      throw error || new Error('Upload not found');
    }

    console.log('[IssuePublicAccessService] Creating signed URL for path:', data.storage_path, 'bucket:', PUBLIC_UPLOAD_BUCKET);

    const { data: signed, error: urlError } = await supabase
      .storage
      .from(PUBLIC_UPLOAD_BUCKET)
      .createSignedUrl(data.storage_path, 60);

    console.log('[IssuePublicAccessService] Signed URL result:', { signed, urlError });

    if (urlError) {
      throw urlError;
    }

    return signed?.signedUrl || null;
  }

  async approveUpload(uploadId, { issueId, projectId, reviewerLabel = 'External Upload' } = {}) {
    if (!supabase) throw new Error('Supabase not configured');
    const { data: upload, error } = await supabase
      .from('issue_external_uploads')
      .select('*')
      .eq('id', uploadId)
      .maybeSingle();

    if (error) throw error;
    if (!upload) throw new Error('Upload not found');
    if (upload.status === 'approved') return upload;

    const { data: fileBlob, error: downloadError } = await supabase
      .storage
      .from(PUBLIC_UPLOAD_BUCKET)
      .download(upload.storage_path);

    if (downloadError) {
      throw downloadError;
    }

    const file = new File([fileBlob], upload.file_name, { type: upload.mime_type || 'application/octet-stream' });
    const metadata = await sharePointStorageService.uploadIssuePhoto(
      projectId || upload.project_id,
      issueId || upload.issue_id,
      file,
      'External Upload'
    );

    const { data: photo, error: photoError } = await supabase
      .from('issue_photos')
      .insert([{
        issue_id: upload.issue_id,
        url: metadata.url,
        sharepoint_drive_id: metadata.driveId,
        sharepoint_item_id: metadata.itemId,
        file_name: metadata.name || upload.file_name,
        content_type: upload.mime_type,
        size_bytes: metadata.size || upload.file_size,
        uploaded_by: reviewerLabel
      }])
      .select()
      .single();

    if (photoError) throw photoError;

    const { data: { user } } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from('issue_external_uploads')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id || null,
        sharepoint_drive_id: metadata.driveId,
        sharepoint_item_id: metadata.itemId,
        final_url: metadata.url,
        review_notes: 'Moved to SharePoint'
      })
      .eq('id', uploadId);

    if (updateError) throw updateError;

    // Clean up Supabase object (best effort)
    try {
      await supabase.storage.from(PUBLIC_UPLOAD_BUCKET).remove([upload.storage_path]);
    } catch (cleanupError) {
      console.warn('Failed to remove pending upload:', cleanupError);
    }

    return photo;
  }

  async rejectUpload(uploadId, reason = '') {
    if (!supabase) throw new Error('Supabase not configured');
    const { data: upload, error } = await supabase
      .from('issue_external_uploads')
      .select('id, storage_path')
      .eq('id', uploadId)
      .maybeSingle();
    if (error) throw error;
    if (!upload) throw new Error('Upload not found');

    const { data: { user } } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from('issue_external_uploads')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        approved_by: user?.id || null
      })
      .eq('id', uploadId);

    if (updateError) throw updateError;

    try {
      await supabase.storage.from(PUBLIC_UPLOAD_BUCKET).remove([upload.storage_path]);
    } catch (cleanupError) {
      console.warn('Failed to remove rejected upload:', cleanupError);
    }
  }

  /**
   * Revoke all public access links for an issue.
   * Call this when an issue is marked as resolved to invalidate all external portal access.
   */
  async revokeLinksForIssue(issueId) {
    if (!supabase || !issueId) return { revoked: 0 };

    try {
      const { data, error } = await supabase
        .from('issue_public_access_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('issue_id', issueId)
        .is('revoked_at', null)
        .select('id');

      if (error) {
        console.error('[IssuePublicAccessService] Failed to revoke links for issue:', error);
        throw error;
      }

      const revokedCount = data?.length || 0;
      console.log('[IssuePublicAccessService] Revoked portal links for issue:', {
        issueId,
        revokedCount
      });

      return { revoked: revokedCount };
    } catch (err) {
      console.error('[IssuePublicAccessService] Error revoking links:', err);
      return { revoked: 0, error: err.message };
    }
  }

  /**
   * Get existing public portal links for an issue, keyed by stakeholder tag ID.
   * Used for sending notifications to external stakeholders with their unique portal URLs.
   */
  async getLinksForIssue(issueId) {
    if (!supabase || !issueId) return {};
    try {
      const { data, error } = await supabase
        .from('issue_public_access_links')
        .select('issue_stakeholder_tag_id, token_hash')
        .eq('issue_id', issueId)
        .is('revoked_at', null);

      if (error) {
        console.warn('[IssuePublicAccessService] Failed to fetch portal links:', error);
        return {};
      }

      // Build a map: stakeholder_tag_id -> portal URL
      // Note: We store hashed tokens, so we can't reconstruct the URL directly.
      // Instead, we'll return a flag indicating this stakeholder has a portal link.
      const linkMap = {};
      (data || []).forEach((row) => {
        if (row.issue_stakeholder_tag_id) {
          linkMap[row.issue_stakeholder_tag_id] = true;
        }
      });
      return linkMap;
    } catch (err) {
      console.warn('[IssuePublicAccessService] Error fetching portal links:', err);
      return {};
    }
  }
}

export const issuePublicAccessService = new IssuePublicAccessService();
