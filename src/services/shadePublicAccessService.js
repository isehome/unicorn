import { supabase } from '../lib/supabase';
import { generatePortalToken, generateOtpCode, hashSecret } from '../utils/portalTokens';

const OTP_TTL_DAYS = 365; // Effectively never expire

class ShadePublicAccessService {
  /**
   * Get or create a public access link for a stakeholder to review shades.
   * If a valid (non-revoked) link already exists, returns it without regenerating.
   */
  async ensureLink({ projectId, stakeholderId, stakeholder, forceRegenerate = false }) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!projectId || !stakeholderId) {
      throw new Error('Missing project context for public link');
    }

    console.log('[ShadePublicAccessService] ensureLink called:', { projectId, stakeholderId, forceRegenerate });

    // Validate project exists before creating link
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('[ShadePublicAccessService] Error checking project:', projectError);
      throw new Error('Failed to validate project');
    }

    if (!project) {
      console.error('[ShadePublicAccessService] Project not found:', projectId);
      throw new Error('Project not found. Cannot create portal link for non-existent project.');
    }

    console.log('[ShadePublicAccessService] Project validated:', project.name);

    // If force regenerate, delete existing link first
    if (forceRegenerate) {
      console.log('[ShadePublicAccessService] Force regenerate - deleting existing link...');
      const { error: deleteError } = await supabase
        .from('shade_public_access_links')
        .delete()
        .eq('project_id', projectId)
        .eq('stakeholder_id', stakeholderId);

      if (deleteError) {
        console.warn('[ShadePublicAccessService] Error deleting existing link:', deleteError);
      }
    } else {
      // Check if a valid (non-revoked) link already exists
      const { data: existingLink, error: fetchError } = await supabase
        .from('shade_public_access_links')
        .select('id, token_hash, contact_email')
        .eq('project_id', projectId)
        .eq('stakeholder_id', stakeholderId)
        .is('revoked_at', null)
        .maybeSingle();

      if (fetchError) {
        console.warn('[ShadePublicAccessService] Error checking for existing link:', fetchError);
      }

      // If a valid link already exists, don't regenerate - just return a flag
      if (existingLink?.id) {
        console.log('[ShadePublicAccessService] Existing valid link found, not regenerating:', {
          linkId: existingLink.id,
          stakeholderId
        });
        return {
          linkId: existingLink.id,
          linkExists: true,
          contactEmail: existingLink.contact_email
        };
      }
    }

    // Create a new link
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;

    // Generate new token and OTP
    const token = generatePortalToken();
    const otp = generateOtpCode();
    console.log('[ShadePublicAccessService] Generated token and OTP');

    const [tokenHash, otpHash] = await Promise.all([
      hashSecret(token),
      hashSecret(otp)
    ]);
    console.log('[ShadePublicAccessService] Hash debug:', {
      tokenPreview: token.substring(0, 10) + '...',
      tokenLength: token.length,
      tokenHashFull: tokenHash, // Full hash for debugging
      tokenHashLength: tokenHash.length
    });
    const expiresAt = new Date(Date.now() + OTP_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const payload = {
      project_id: projectId,
      stakeholder_id: stakeholderId,
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

    console.log('[ShadePublicAccessService] Inserting new link...');
    const { data, error } = await supabase
      .from('shade_public_access_links')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('[ShadePublicAccessService] Failed to insert shade public link:', error);
      throw new Error('Failed to generate public share link: ' + error.message);
    }

    // Verify the token_hash was actually saved correctly
    const { data: verifyData } = await supabase
      .from('shade_public_access_links')
      .select('token_hash')
      .eq('id', data.id)
      .single();

    console.log('[ShadePublicAccessService] Link created and verified:', {
      linkId: data.id,
      stakeholderId,
      projectId,
      expectedHash: tokenHash.substring(0, 20) + '...',
      actualHash: verifyData?.token_hash?.substring(0, 20) + '...',
      hashMatch: verifyData?.token_hash === tokenHash,
      hasToken: !!token,
      hasOtp: !!otp
    });

    return {
      linkId: data.id,
      token,
      otp,
      contactEmail: payload.contact_email
    };
  }

  /**
   * Build the full portal URL for a shade review link
   */
  buildPortalUrl(token) {
    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.REACT_APP_BASE_URL || 'https://unicorn-isehome.vercel.app';
    return `${baseUrl}/shade-portal/${token}`;
  }

  /**
   * Revoke all public access links for a project's shades.
   */
  async revokeLinksForProject(projectId) {
    if (!supabase || !projectId) return { revoked: 0 };

    try {
      const { data, error } = await supabase
        .from('shade_public_access_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .is('revoked_at', null)
        .select('id');

      if (error) {
        console.error('[ShadePublicAccessService] Failed to revoke links for project:', error);
        throw error;
      }

      const revokedCount = data?.length || 0;
      console.log('[ShadePublicAccessService] Revoked portal links for project:', {
        projectId,
        revokedCount
      });

      return { revoked: revokedCount };
    } catch (err) {
      console.error('[ShadePublicAccessService] Error revoking links:', err);
      return { revoked: 0, error: err.message };
    }
  }
}

export const shadePublicAccessService = new ShadePublicAccessService();
