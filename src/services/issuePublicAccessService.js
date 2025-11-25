import { supabase } from '../lib/supabase';
import { sharePointStorageService } from './sharePointStorageService';
import { generatePortalToken, generateOtpCode, hashSecret } from '../utils/portalTokens';

const PUBLIC_UPLOAD_BUCKET = 'public-issue-uploads';
const OTP_TTL_DAYS = 7;

class IssuePublicAccessService {
  async ensureLink({ issueId, projectId, stakeholderTagId, stakeholder }) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!issueId || !projectId || !stakeholderTagId) {
      throw new Error('Missing issue context for public link');
    }

    const token = generatePortalToken();
    const otp = generateOtpCode();
    const [tokenHash, otpHash] = await Promise.all([
      hashSecret(token),
      hashSecret(otp)
    ]);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;
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
      verification_attempts: 0,
      revoked_at: null,
      created_by: userId,
      updated_by: userId
    };

    const { data, error } = await supabase
      .from('issue_public_access_links')
      .upsert([payload], { onConflict: 'issue_stakeholder_tag_id' })
      .select()
      .single();

    if (error) {
      console.error('Failed to upsert issue public link:', error);
      throw new Error('Failed to generate public share link');
    }

    return {
      linkId: data.id,
      token,
      otp,
      contactEmail: payload.contact_email
    };
  }

  async listUploads(issueId) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('issue_external_uploads')
      .select('*')
      .eq('issue_id', issueId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getSignedDownloadUrl(uploadId) {
    if (!supabase || !uploadId) return null;
    const { data, error } = await supabase
      .from('issue_external_uploads')
      .select('id, storage_path')
      .eq('id', uploadId)
      .maybeSingle();
    if (error || !data?.storage_path) {
      throw error || new Error('Upload not found');
    }

    const { data: signed, error: urlError } = await supabase
      .storage
      .from(PUBLIC_UPLOAD_BUCKET)
      .createSignedUrl(data.storage_path, 60);

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
}

export const issuePublicAccessService = new IssuePublicAccessService();
