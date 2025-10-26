# Procurement System - UI Integration Guide

## Component Structure for PM Dashboard

This guide shows how to integrate the procurement system into your PM Dashboard.

## 1. Supplier Management Component

### SupplierList.js
```javascript
import React, { useState, useEffect } from 'react';
import { supplierService } from '../services/supplierService';

export default function SupplierList() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      const data = await supplierService.getAllSuppliers(true);
      setSuppliers(data);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="supplier-list">
      <h2>Suppliers</h2>
      {suppliers.map(supplier => (
        <div key={supplier.id} className="supplier-card">
          <h3>{supplier.name}</h3>
          <p>Code: {supplier.short_code}</p>
          <p>Contact: {supplier.contact_name}</p>
          <p>Email: {supplier.email}</p>
          <p>Terms: {supplier.payment_terms}</p>
        </div>
      ))}
    </div>
  );
}
```

### SupplierForm.js
```javascript
import React, { useState } from 'react';
import { supplierService } from '../services/supplierService';

export default function SupplierForm({ onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    short_code: '',
    contact_name: '',
    email: '',
    phone: '',
    payment_terms: 'Net 30',
    is_active: true
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await supplierService.createSupplier(formData);
      onSuccess();
    } catch (error) {
      console.error('Error creating supplier:', error);
      alert('Failed to create supplier: ' + error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Supplier Name"
        value={formData.name}
        onChange={e => setFormData({...formData, name: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="Short Code (2-6 chars)"
        value={formData.short_code}
        onChange={e => setFormData({...formData, short_code: e.target.value.toUpperCase()})}
        maxLength={6}
        required
      />
      <input
        type="text"
        placeholder="Contact Name"
        value={formData.contact_name}
        onChange={e => setFormData({...formData, contact_name: e.target.value})}
      />
      <input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={e => setFormData({...formData, email: e.target.value})}
      />
      <input
        type="tel"
        placeholder="Phone"
        value={formData.phone}
        onChange={e => setFormData({...formData, phone: e.target.value})}
      />
      <select
        value={formData.payment_terms}
        onChange={e => setFormData({...formData, payment_terms: e.target.value})}
      >
        <option>Net 30</option>
        <option>Net 60</option>
        <option>COD</option>
        <option>Prepaid</option>
      </select>
      <button type="submit">Create Supplier</button>
    </form>
  );
}
```

## 2. Purchase Order Creation Component

### POCreator.js - Equipment Grouped by Supplier
```javascript
import React, { useState, useEffect } from 'react';
import { supplierService } from '../services/supplierService';
import { purchaseOrderService } from '../services/purchaseOrderService';

export default function POCreator({ projectId, milestoneStage }) {
  const [groupedEquipment, setGroupedEquipment] = useState({});
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    loadEquipment();
  }, [projectId, milestoneStage]);

  const loadEquipment = async () => {
    const grouped = await supplierService.getEquipmentGroupedBySupplier(
      projectId,
      milestoneStage
    );
    setGroupedEquipment(grouped);
  };

  const createPO = async (supplierName) => {
    const supplier = groupedEquipment[supplierName].supplier;
    const equipmentIds = groupedEquipment[supplierName].equipment.map(e => e.equipment_id);

    try {
      const po = await purchaseOrderService.createPOFromEquipment(
        projectId,
        supplier.id,
        milestoneStage,
        equipmentIds,
        {
          ship_to_address: '123 Project Site Address',
          requested_delivery_date: calculateDeliveryDate()
        }
      );

      alert(`Purchase Order ${po.po_number} created successfully!`);
      loadEquipment(); // Refresh
    } catch (error) {
      console.error('Error creating PO:', error);
      alert('Failed to create PO: ' + error.message);
    }
  };

  const calculateDeliveryDate = () => {
    // Set requested delivery date 2 weeks from now
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  };

  return (
    <div className="po-creator">
      <h2>Create Purchase Orders - {milestoneStage}</h2>

      {Object.entries(groupedEquipment).map(([supplierName, data]) => (
        <div key={supplierName} className="supplier-group">
          <div className="supplier-header">
            <h3>{supplierName}</h3>
            <p>{data.equipment.length} items | ${data.totalCost.toFixed(2)}</p>
            <button onClick={() => createPO(supplierName)}>
              Create PO
            </button>
          </div>

          <div className="equipment-list">
            {data.equipment.map(item => (
              <div key={item.equipment_id} className="equipment-item">
                <span>{item.name}</span>
                <span>Part: {item.part_number}</span>
                <span>Qty: {item.quantity_to_order}</span>
                <span>${item.line_total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## 3. Purchase Order List Component

### POList.js
```javascript
import React, { useState, useEffect } from 'react';
import { purchaseOrderService } from '../services/purchaseOrderService';

export default function POList({ projectId }) {
  const [pos, setPOs] = useState([]);
  const [filter, setFilter] = useState({ milestone_stage: null, status: null });

  useEffect(() => {
    loadPOs();
  }, [projectId, filter]);

  const loadPOs = async () => {
    const data = await purchaseOrderService.getProjectPurchaseOrders(
      projectId,
      filter
    );
    setPOs(data);
  };

  const getStatusBadge = (status) => {
    const colors = {
      draft: 'gray',
      submitted: 'blue',
      confirmed: 'green',
      partially_received: 'yellow',
      received: 'green',
      cancelled: 'red'
    };
    return (
      <span className={`badge badge-${colors[status]}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="po-list">
      <h2>Purchase Orders</h2>

      <div className="filters">
        <select
          value={filter.milestone_stage || ''}
          onChange={e => setFilter({...filter, milestone_stage: e.target.value || null})}
        >
          <option value="">All Milestones</option>
          <option value="prewire_prep">Prewire Prep</option>
          <option value="trim_prep">Trim Prep</option>
        </select>

        <select
          value={filter.status || ''}
          onChange={e => setFilter({...filter, status: e.target.value || null})}
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="received">Received</option>
        </select>
      </div>

      <div className="po-cards">
        {pos.map(po => (
          <div key={po.id} className="po-card">
            <div className="po-header">
              <h3>{po.po_number}</h3>
              {getStatusBadge(po.status)}
            </div>

            <div className="po-details">
              <p><strong>Supplier:</strong> {po.supplier_name}</p>
              <p><strong>Stage:</strong> {po.milestone_stage}</p>
              <p><strong>Order Date:</strong> {po.order_date}</p>
              <p><strong>Expected:</strong> {po.expected_delivery_date || 'TBD'}</p>
              <p><strong>Total:</strong> ${po.total_amount.toFixed(2)}</p>
              <p><strong>Items:</strong> {po.items_received}/{po.item_count} received</p>
              {po.tracking_count > 0 && (
                <p><strong>Tracking:</strong> {po.tracking_count} shipment(s)</p>
              )}
            </div>

            <div className="po-actions">
              <button onClick={() => viewPO(po.id)}>View Details</button>
              {po.status === 'draft' && (
                <button onClick={() => submitPO(po.id)}>Submit</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 4. Tracking Component

### TrackingInput.js
```javascript
import React, { useState } from 'react';
import { trackingService } from '../services/trackingService';

export default function TrackingInput({ poId, onSuccess }) {
  const [formData, setFormData] = useState({
    tracking_number: '',
    carrier: 'USPS',
    carrier_service: '',
    shipped_date: new Date().toISOString().split('T')[0],
    auto_tracking_enabled: true
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await trackingService.addTracking(poId, formData);
      alert('Tracking added successfully!');
      onSuccess();
    } catch (error) {
      console.error('Error adding tracking:', error);
      alert('Failed to add tracking: ' + error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Tracking Number"
        value={formData.tracking_number}
        onChange={e => setFormData({...formData, tracking_number: e.target.value})}
        required
      />

      <select
        value={formData.carrier}
        onChange={e => setFormData({...formData, carrier: e.target.value})}
      >
        <option value="USPS">USPS</option>
        <option value="UPS">UPS</option>
        <option value="FEDEX">FedEx</option>
        <option value="DHL">DHL</option>
        <option value="AMAZON">Amazon</option>
        <option value="Other">Other</option>
      </select>

      <input
        type="text"
        placeholder="Service (e.g., Ground, Express)"
        value={formData.carrier_service}
        onChange={e => setFormData({...formData, carrier_service: e.target.value})}
      />

      <input
        type="date"
        value={formData.shipped_date}
        onChange={e => setFormData({...formData, shipped_date: e.target.value})}
      />

      <label>
        <input
          type="checkbox"
          checked={formData.auto_tracking_enabled}
          onChange={e => setFormData({...formData, auto_tracking_enabled: e.target.checked})}
        />
        Auto-update tracking
      </label>

      <button type="submit">Add Tracking</button>
    </form>
  );
}
```

### TrackingStatus.js
```javascript
import React, { useState, useEffect } from 'react';
import { trackingService } from '../services/trackingService';

export default function TrackingStatus({ poId }) {
  const [trackings, setTrackings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTracking();
  }, [poId]);

  const loadTracking = async () => {
    const data = await trackingService.getPOTracking(poId);
    setTrackings(data);
  };

  const refreshTracking = async (trackingId) => {
    setRefreshing(true);
    try {
      await trackingService.refreshTracking(trackingId);
      await loadTracking();
    } catch (error) {
      console.error('Error refreshing tracking:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'gray',
      in_transit: 'blue',
      out_for_delivery: 'purple',
      delivered: 'green',
      exception: 'red',
      returned: 'orange'
    };
    return colors[status] || 'gray';
  };

  return (
    <div className="tracking-status">
      <h3>Shipment Tracking</h3>

      {trackings.map(tracking => (
        <div key={tracking.id} className="tracking-card">
          <div className="tracking-header">
            <span className={`status-badge ${getStatusColor(tracking.status)}`}>
              {tracking.status.replace('_', ' ')}
            </span>
            <span className="carrier">{tracking.carrier}</span>
          </div>

          <div className="tracking-details">
            <p><strong>Tracking #:</strong> {tracking.tracking_number}</p>
            {tracking.tracking_url && (
              <a href={tracking.tracking_url} target="_blank" rel="noopener noreferrer">
                Track on {tracking.carrier}
              </a>
            )}
            {tracking.current_location && (
              <p><strong>Location:</strong> {tracking.current_location}</p>
            )}
            {tracking.shipped_date && (
              <p><strong>Shipped:</strong> {tracking.shipped_date}</p>
            )}
            {tracking.estimated_delivery_date && (
              <p><strong>Est. Delivery:</strong> {tracking.estimated_delivery_date}</p>
            )}
            {tracking.actual_delivery_date && (
              <p><strong>Delivered:</strong> {tracking.actual_delivery_date}</p>
            )}
            {tracking.last_checked_at && (
              <p className="last-check">
                Last updated: {new Date(tracking.last_checked_at).toLocaleString()}
              </p>
            )}
          </div>

          {tracking.auto_tracking_enabled && (
            <button
              onClick={() => refreshTracking(tracking.id)}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh Status'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

## 5. Delivery Dashboard

### DeliveryDashboard.js
```javascript
import React, { useState, useEffect } from 'react';
import { trackingService } from '../services/trackingService';
import { purchaseOrderService } from '../services/purchaseOrderService';

export default function DeliveryDashboard({ projectId }) {
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    const [deliverySummary, poStats] = await Promise.all([
      trackingService.getProjectDeliverySummary(projectId),
      purchaseOrderService.getProjectPOStats(projectId)
    ]);
    setSummary(deliverySummary);
    setStats(poStats);
  };

  const refreshAllTracking = async () => {
    await trackingService.refreshAllActiveTracking(projectId);
    await loadData();
  };

  if (!summary || !stats) return <div>Loading...</div>;

  return (
    <div className="delivery-dashboard">
      <h2>Delivery Status</h2>

      <button onClick={refreshAllTracking}>Refresh All Tracking</button>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Purchase Orders</h3>
          <div className="stat-value">{stats.total_pos}</div>
          <div className="stat-detail">Total Value: ${stats.total_value.toFixed(2)}</div>
        </div>

        <div className="stat-card">
          <h3>Shipments</h3>
          <div className="stat-value">{summary.total_shipments}</div>
          <div className="stat-breakdown">
            <div>In Transit: {summary.in_transit}</div>
            <div>Out for Delivery: {summary.out_for_delivery}</div>
            <div>Delivered: {summary.delivered}</div>
            {summary.exceptions > 0 && (
              <div className="alert">Exceptions: {summary.exceptions}</div>
            )}
          </div>
        </div>

        <div className="stat-card">
          <h3>Prewire Prep</h3>
          <div className="stat-value">${stats.prewire_value.toFixed(2)}</div>
          <div className="stat-detail">
            {stats.by_milestone.prewire_prep || 0} POs
          </div>
        </div>

        <div className="stat-card">
          <h3>Trim Prep</h3>
          <div className="stat-value">${stats.trim_value.toFixed(2)}</div>
          <div className="stat-detail">
            {stats.by_milestone.trim_prep || 0} POs
          </div>
        </div>
      </div>
    </div>
  );
}
```

## 6. Integration into PMDashboard

Add to your existing [PMDashboard.js](src/components/PMDashboard.js):

```javascript
import POList from './procurement/POList';
import DeliveryDashboard from './procurement/DeliveryDashboard';
import SupplierList from './procurement/SupplierList';

// Add a new tab or section
<div className="procurement-section">
  <h2>Procurement & Orders</h2>

  <DeliveryDashboard projectId={currentProject.id} />

  <POList projectId={currentProject.id} />

  {/* Link to create new POs */}
  <button onClick={() => navigate(`/project/${currentProject.id}/create-po`)}>
    Create Purchase Orders
  </button>
</div>
```

## CSS Styling Suggestions

```css
.supplier-card, .po-card, .tracking-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: white;
}

.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.badge-gray { background: #e0e0e0; color: #424242; }
.badge-blue { background: #2196f3; color: white; }
.badge-green { background: #4caf50; color: white; }
.badge-yellow { background: #ffc107; color: #424242; }
.badge-red { background: #f44336; color: white; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #2196f3;
}
```

## Next Steps

1. Create a `src/components/procurement/` directory
2. Add these components one by one
3. Test each component individually
4. Integrate into your PM Dashboard
5. Customize styling to match your design system

---

This guide provides ready-to-use React components that integrate with the services you've already created!
