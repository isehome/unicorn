import React, { useState } from 'react';
import { Package, CheckSquare, Square, Save, AlertCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const WireDropCommissioning = ({ wireDropId, onClose, onSave }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [commissioningData, setCommissioningData] = useState({
    wireDropId: wireDropId || '',
    installDate: new Date().toISOString().split('T')[0],
    installer: '',
    location: '',
    notes: '',
    checklist: {
      powerConnected: false,
      networkConnected: false,
      devicesScanned: false,
      testCompleted: false,
      labelsApplied: false,
      photosUploaded: false
    },
    status: 'pending'
  });

  const handleChecklistChange = (item) => {
    setCommissioningData(prev => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [item]: !prev.checklist[item]
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      console.log('Saving commissioning data:', commissioningData);
      if (onSave) onSave(commissioningData);
      if (onClose) onClose();
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  const allChecked = Object.values(commissioningData.checklist).every(v => v === true);

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-60">
      <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Package className="w-5 h-5" />
              Wire Drop Commissioning
            </h2>
          </div>
          <span className="text-sm text-gray-500">ID: {wireDropId}</span>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Installation Details</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Install Date
              </label>
              <input
                type="date"
                value={commissioningData.installDate}
                onChange={(e) => setCommissioningData(prev => ({ ...prev, installDate: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Installer Name
              </label>
              <input
                type="text"
                value={commissioningData.installer}
                onChange={(e) => setCommissioningData(prev => ({ ...prev, installer: e.target.value }))}
                placeholder="Enter installer name"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location/Room
              </label>
              <input
                type="text"
                value={commissioningData.location}
                onChange={(e) => setCommissioningData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Server Room, Office 201"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Commissioning Checklist</h3>
            
            <div className="space-y-3">
              {Object.entries({
                powerConnected: 'Power Connected & Verified',
                networkConnected: 'Network Connected & Online',
                devicesScanned: 'All Devices Scanned & Registered',
                testCompleted: 'Functionality Test Completed',
                labelsApplied: 'Labels Applied & Documented',
                photosUploaded: 'Installation Photos Uploaded'
              }).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleChecklistChange(key)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors text-left"
                >
                  {commissioningData.checklist[key] ? (
                    <CheckSquare className="w-5 h-5 text-green-600" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                  <span className={commissioningData.checklist[key] ? 'text-green-800' : 'text-gray-700'}>
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {allChecked && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-green-600" />
                <span className="text-green-800">All items checked - Ready for completion</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={commissioningData.notes}
              onChange={(e) => setCommissioningData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add any additional notes..."
              rows="4"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {!allChecked && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <span className="text-yellow-800 text-sm">
                Please complete all checklist items before marking as commissioned.
              </span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!allChecked || saving}
            className={`px-6 py-2 rounded-lg transition-colors flex items-center gap-2 ${
              allChecked && !saving
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Complete Commissioning'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WireDropCommissioning;