import { supabase } from '../lib/supabase';
import { generatePortalToken, hashSecret } from '../utils/portalTokens';

class POPublicAccessService {
  async ensureLink({ poId, projectId, supplierId, supplier }) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!poId || !projectId) throw new Error('Missing PO context');
    const token = generatePortalToken(36);
    const tokenHash = await hashSecret(token);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;

    const { data, error } = await supabase
      .from('po_public_access_links')
      .upsert([{
        purchase_order_id: poId,
        project_id: projectId,
        supplier_id: supplierId || null,
        contact_email: supplier?.email || null,
        contact_name: supplier?.name || null,
        token_hash: tokenHash,
        reminders_paused: false,
        updated_by: userId,
        created_by: userId
      }], { onConflict: 'purchase_order_id' })
      .select()
      .single();

    if (error) {
      console.error('Failed to upsert vendor portal link:', error);
      throw error;
    }

    return {
      linkId: data.id,
      token
    };
  }
}

export const poPublicAccessService = new POPublicAccessService();
