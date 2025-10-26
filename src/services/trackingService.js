import { supabase } from '../lib/supabase';

class TrackingService {
  /**
   * Add tracking information to a purchase order
   */
  async addTracking(poId, trackingData) {
    try {
      const { data, error } = await supabase
        .from('shipment_tracking')
        .insert([{
          po_id: poId,
          tracking_number: trackingData.tracking_number,
          carrier: trackingData.carrier,
          carrier_service: trackingData.carrier_service,
          status: trackingData.status || 'pending',
          shipped_date: trackingData.shipped_date,
          estimated_delivery_date: trackingData.estimated_delivery_date,
          auto_tracking_enabled: trackingData.auto_tracking_enabled === true, // Default to false
          notes: trackingData.notes
        }])
        .select()
        .single();

      if (error) throw error;

      // If auto-tracking is enabled, fetch initial status
      if (trackingData.auto_tracking_enabled === true) {
        await this.refreshTracking(data.id);
      }

      return data;
    } catch (error) {
      console.error('Error adding tracking:', error);
      throw error;
    }
  }

  /**
   * Update tracking information
   */
  async updateTracking(trackingId, updates) {
    try {
      const { data, error } = await supabase
        .from('shipment_tracking')
        .update(updates)
        .eq('id', trackingId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating tracking:', error);
      throw error;
    }
  }

  /**
   * Get tracking info for a PO
   */
  async getPOTracking(poId) {
    try {
      const { data, error } = await supabase
        .from('shipment_tracking')
        .select('*')
        .eq('po_id', poId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching tracking:', error);
      throw error;
    }
  }

  /**
   * Refresh tracking data from carrier API
   * This is a placeholder - actual implementation depends on which API you choose
   */
  async refreshTracking(trackingId) {
    try {
      const { data: tracking, error } = await supabase
        .from('shipment_tracking')
        .select('*')
        .eq('id', trackingId)
        .single();

      if (error) throw error;

      // Call carrier API based on carrier
      let trackingInfo = null;
      switch (tracking.carrier.toUpperCase()) {
        case 'USPS':
          trackingInfo = await this.fetchUSPSTracking(tracking.tracking_number);
          break;
        case 'UPS':
          trackingInfo = await this.fetchUPSTracking(tracking.tracking_number);
          break;
        case 'FEDEX':
          trackingInfo = await this.fetchFedExTracking(tracking.tracking_number);
          break;
        case 'DHL':
          trackingInfo = await this.fetchDHLTracking(tracking.tracking_number);
          break;
        default:
          console.warn(`No API integration for carrier: ${tracking.carrier}`);
          return tracking;
      }

      if (trackingInfo) {
        // Update tracking record with new data
        const updates = {
          status: trackingInfo.status,
          current_location: trackingInfo.current_location,
          estimated_delivery_date: trackingInfo.estimated_delivery_date,
          actual_delivery_date: trackingInfo.actual_delivery_date,
          tracking_data: trackingInfo.raw_data,
          last_checked_at: new Date().toISOString()
        };

        return await this.updateTracking(trackingId, updates);
      }

      return tracking;
    } catch (error) {
      console.error('Error refreshing tracking:', error);
      throw error;
    }
  }

  /**
   * Fetch USPS tracking data
   * Requires USPS Web Tools API credentials
   * https://www.usps.com/business/web-tools-apis/
   */
  async fetchUSPSTracking(trackingNumber) {
    try {
      // This requires a USPS API key
      const USPS_USER_ID = process.env.REACT_APP_USPS_USER_ID;
      if (!USPS_USER_ID) {
        console.warn('USPS API credentials not configured');
        return null;
      }

      const apiUrl = `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=<TrackRequest USERID="${USPS_USER_ID}"><TrackID ID="${trackingNumber}"></TrackID></TrackRequest>`;

      const response = await fetch(apiUrl);
      const xmlText = await response.text();

      // Parse XML response (simplified - you'd want a proper XML parser)
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      const status = xmlDoc.querySelector('Status')?.textContent;
      const statusDetail = xmlDoc.querySelector('StatusSummary')?.textContent;
      const eventDate = xmlDoc.querySelector('EventDate')?.textContent;
      const eventTime = xmlDoc.querySelector('EventTime')?.textContent;

      return {
        status: this.normalizeStatus(status),
        current_location: statusDetail,
        estimated_delivery_date: null, // USPS doesn't always provide ETA
        actual_delivery_date: status === 'Delivered' ? eventDate : null,
        raw_data: { status, statusDetail, eventDate, eventTime }
      };
    } catch (error) {
      console.error('Error fetching USPS tracking:', error);
      return null;
    }
  }

  /**
   * Fetch UPS tracking data
   * Requires UPS API credentials
   * https://www.ups.com/upsdeveloperkit
   */
  async fetchUPSTracking(trackingNumber) {
    try {
      // This requires UPS API credentials
      const UPS_ACCESS_KEY = process.env.REACT_APP_UPS_ACCESS_KEY;
      if (!UPS_ACCESS_KEY) {
        console.warn('UPS API credentials not configured');
        return null;
      }

      // UPS requires OAuth - this is simplified
      // You'd need to implement proper UPS API authentication
      console.log('UPS tracking not yet implemented:', trackingNumber);
      return null;
    } catch (error) {
      console.error('Error fetching UPS tracking:', error);
      return null;
    }
  }

  /**
   * Fetch FedEx tracking data
   * Requires FedEx API credentials
   * https://developer.fedex.com/
   */
  async fetchFedExTracking(trackingNumber) {
    try {
      // This requires FedEx API credentials
      const FEDEX_API_KEY = process.env.REACT_APP_FEDEX_API_KEY;
      if (!FEDEX_API_KEY) {
        console.warn('FedEx API credentials not configured');
        return null;
      }

      // FedEx requires OAuth - this is simplified
      console.log('FedEx tracking not yet implemented:', trackingNumber);
      return null;
    } catch (error) {
      console.error('Error fetching FedEx tracking:', error);
      return null;
    }
  }

  /**
   * Fetch DHL tracking data
   * Requires DHL API credentials
   * https://developer.dhl.com/
   */
  async fetchDHLTracking(trackingNumber) {
    try {
      const DHL_API_KEY = process.env.REACT_APP_DHL_API_KEY;
      if (!DHL_API_KEY) {
        console.warn('DHL API credentials not configured');
        return null;
      }

      console.log('DHL tracking not yet implemented:', trackingNumber);
      return null;
    } catch (error) {
      console.error('Error fetching DHL tracking:', error);
      return null;
    }
  }

  /**
   * Alternative: Use AfterShip unified tracking API
   * This provides a single API for all carriers
   * https://www.aftership.com/
   *
   * Free tier: 200 shipments/month
   * Supports 900+ carriers worldwide
   */
  async fetchAfterShipTracking(trackingNumber, carrier) {
    try {
      const AFTERSHIP_API_KEY = process.env.REACT_APP_AFTERSHIP_API_KEY;
      if (!AFTERSHIP_API_KEY) {
        console.warn('AfterShip API key not configured');
        return null;
      }

      // Normalize carrier slug for AfterShip
      const carrierSlug = this.getAfterShipCarrierSlug(carrier);

      // First, create/add tracking to AfterShip
      const createResponse = await fetch('https://api.aftership.com/v4/trackings', {
        method: 'POST',
        headers: {
          'aftership-api-key': AFTERSHIP_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tracking: {
            tracking_number: trackingNumber,
            slug: carrierSlug
          }
        })
      });

      if (!createResponse.ok && createResponse.status !== 409) {
        // 409 means tracking already exists, which is fine
        throw new Error('Failed to add tracking to AfterShip');
      }

      // Fetch tracking details
      const trackResponse = await fetch(
        `https://api.aftership.com/v4/trackings/${carrierSlug}/${trackingNumber}`,
        {
          headers: {
            'aftership-api-key': AFTERSHIP_API_KEY
          }
        }
      );

      if (!trackResponse.ok) {
        throw new Error('Failed to fetch tracking from AfterShip');
      }

      const data = await trackResponse.json();
      const tracking = data.data.tracking;

      return {
        status: this.normalizeStatus(tracking.tag),
        current_location: tracking.checkpoints?.[0]?.location || null,
        estimated_delivery_date: tracking.expected_delivery || null,
        actual_delivery_date: tracking.tag === 'Delivered' ? tracking.updated_at : null,
        raw_data: tracking
      };
    } catch (error) {
      console.error('Error fetching AfterShip tracking:', error);
      return null;
    }
  }

  /**
   * Get AfterShip carrier slug from carrier name
   */
  getAfterShipCarrierSlug(carrier) {
    const carrierMap = {
      'USPS': 'usps',
      'UPS': 'ups',
      'FEDEX': 'fedex',
      'DHL': 'dhl',
      'AMAZON': 'amazon'
    };
    return carrierMap[carrier.toUpperCase()] || carrier.toLowerCase();
  }

  /**
   * Normalize status across different carriers
   */
  normalizeStatus(carrierStatus) {
    if (!carrierStatus) return 'pending';

    const status = carrierStatus.toLowerCase();

    if (status.includes('deliver') && !status.includes('exception')) {
      return 'delivered';
    }
    if (status.includes('out for delivery')) {
      return 'out_for_delivery';
    }
    if (status.includes('transit') || status.includes('in progress')) {
      return 'in_transit';
    }
    if (status.includes('exception') || status.includes('attempted')) {
      return 'exception';
    }
    if (status.includes('return')) {
      return 'returned';
    }

    return 'pending';
  }

  /**
   * Get tracking URL for carrier
   */
  getTrackingUrl(carrier, trackingNumber) {
    const urls = {
      'USPS': `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
      'UPS': `https://www.ups.com/track?tracknum=${trackingNumber}`,
      'FEDEX': `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      'DHL': `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
      'AMAZON': `https://track.amazon.com/tracking/${trackingNumber}`
    };

    return urls[carrier.toUpperCase()] || null;
  }

  /**
   * Batch refresh all active tracking numbers
   */
  async refreshAllActiveTracking(projectId = null) {
    try {
      let query = supabase
        .from('shipment_tracking')
        .select('id, po_id, tracking_number, carrier, status')
        .eq('auto_tracking_enabled', true)
        .not('status', 'in', '(delivered,returned,cancelled)');

      if (projectId) {
        // Join with purchase_orders to filter by project
        const { data: pos } = await supabase
          .from('purchase_orders')
          .select('id')
          .eq('project_id', projectId);

        if (pos && pos.length > 0) {
          const poIds = pos.map(po => po.id);
          query = query.in('po_id', poIds);
        }
      }

      const { data: trackings, error } = await query;
      if (error) throw error;

      // Refresh each tracking (consider rate limiting)
      const results = [];
      for (const tracking of trackings || []) {
        try {
          const updated = await this.refreshTracking(tracking.id);
          results.push(updated);
        } catch (err) {
          console.error(`Failed to refresh tracking ${tracking.id}:`, err);
        }
      }

      return results;
    } catch (error) {
      console.error('Error refreshing all tracking:', error);
      throw error;
    }
  }

  /**
   * Get delivery summary for a project
   */
  async getProjectDeliverySummary(projectId) {
    try {
      // Get all POs for project
      const { data: pos, error: posError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('project_id', projectId);

      if (posError) throw posError;

      if (!pos || pos.length === 0) {
        return {
          total_shipments: 0,
          in_transit: 0,
          out_for_delivery: 0,
          delivered: 0,
          exceptions: 0,
          pending: 0
        };
      }

      const poIds = pos.map(po => po.id);

      // Get tracking summary
      const { data: trackings, error: trackError } = await supabase
        .from('shipment_tracking')
        .select('status')
        .in('po_id', poIds);

      if (trackError) throw trackError;

      const summary = {
        total_shipments: trackings?.length || 0,
        in_transit: 0,
        out_for_delivery: 0,
        delivered: 0,
        exceptions: 0,
        pending: 0
      };

      trackings?.forEach(t => {
        summary[t.status] = (summary[t.status] || 0) + 1;
      });

      return summary;
    } catch (error) {
      console.error('Error getting delivery summary:', error);
      throw error;
    }
  }

  /**
   * Delete tracking record
   */
  async deleteTracking(trackingId) {
    try {
      const { error } = await supabase
        .from('shipment_tracking')
        .delete()
        .eq('id', trackingId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting tracking:', error);
      throw error;
    }
  }
}

export const trackingService = new TrackingService();
