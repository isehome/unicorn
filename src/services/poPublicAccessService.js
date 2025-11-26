const PO_API_ENDPOINT = '/api/public-po';

class POPublicAccessService {
  /**
   * Create or update a vendor portal link for a PO
   * Uses the server-side API to bypass RLS restrictions
   */
  async ensureLink({ poId, projectId, supplierId, supplier }) {
    if (!poId || !projectId) throw new Error('Missing PO context');

    const response = await fetch(PO_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create-link',
        poId,
        projectId,
        supplierId: supplierId || null,
        supplierName: supplier?.name || null,
        supplierEmail: supplier?.email || null
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to create vendor portal link:', errorData);
      throw new Error(errorData.error || `Failed to create portal link (${response.status})`);
    }

    const data = await response.json();
    return {
      linkId: data.linkId,
      token: data.token
    };
  }
}

export const poPublicAccessService = new POPublicAccessService();
