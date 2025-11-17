import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import RoomChangeConfirmation from './RoomChangeConfirmation';
import UniFiClientSelectorEnhanced from './UniFiClientSelectorEnhanced';
import HomeKitQRUpload from './HomeKitQRUpload';
import { supabase } from '../lib/supabase';

const WireDropEquipmentSection = ({ 
  wireDrop, 
  projectEquipment = [],
  onSave
}) => {
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(wireDrop?.room_equipment_id || '');
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [equipmentRoomCha nges, setEquipmentRoomChanges] = useState([]);
  const [showRoomChangeModal, setShowRoomChangeModal] = useState(false);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [saving, setSaving] = useState(false);

  const sortedEquipment = useMemo(() => {
    const wireDropRoomName = wireDrop.room_name || wireDrop.room;
    const roomEquipment = projectEquipment
      .filter(e => e.room_name === wireDropRoomName || e.location === wireDropRoomName)
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const otherEquipment = projectEquipment
      .filter(e => e.room_name !== wireDropRoomName && e.location !== wireDropRoomName)
      .sort((a, b) => {
        const roomCompare = (a.room_name || a.location || '').localeCompare(b.room_name || b.location || '');
        if (roomCompare !== 0) return roomCompare;
        return a.name.localeCompare(b.name);
      });
    
    return [...roomEquipment, ...otherEquipment];
  }, [projectEquipment, wireDrop.room, wireDrop.room_name]);

  useEffect(() => {
    if (selectedEquipmentId) {
      const equipment = projectEquipment.find(e => e.id === selectedEquipmentId);
      setSelectedEquipment(equipment);
      
      const wireDropRoom = wireDrop.room || wireDrop.room_name;
      const equipmentRoom = equipment?.room || equipment?.room_name;
      
      if (equipment && equipmentRoom && wireDropRoom && equipmentRoom !== wireDropRoom) {
        const changeExists = equipmentRoomChanges.some(
          c => c.equipmentId === equipment.id
        );
        
        if (!changeExists) {
          setEquipmentRoomChanges(prev => [...prev, {
            equipmentId: equipment.id,
            oldRoom: equipmentRoom,
            newRoom: wireDropRoom,
            equipmentName: equipment.name
          }]);
        }
      }
    } else {
      setSelectedEquipment(null);
    }
  }, [selectedEquipmentId, projectEquipment, wireDrop.room, wireDrop.room_name]);

  const handleEquipmentSelect = (equipmentId) => {
    setSelectedEquipmentId(equipmentId);
  };

  const handleUniFiLink = async (equipmentId, unifiData) => {
    if (!unifiData) return;
    
    try {
      const { error } = await supabase
        .from('project_equipment')
        .update(unifiData)
        .eq('id', equipmentId);
      
      if (error) throw error;
      
      setSelectedEquipment(prev => ({
        ...prev,
        ...unifiData
      }));
    } catch (error) {
      console.error('Failed to update UniFi data:', error);
    }
  };

  const handleHomeKitUpload = (data) => {
    setSelectedEquipment(prev => ({
      ...prev,
      homekit_qr_photo: data.photo_url,
      homekit_setup_code: data.setup_code
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      if (equipmentRoomChanges.length > 0) {
        setPendingChanges(equipmentRoomChanges);
        setShowRoomChangeModal(true);
        setSaving(false);
        return;
      }
      
      await saveWireDrop();
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save wire drop');
    } finally {
      setSaving(false);
    }
  };

  const saveWireDrop = async () => {
    try {
      const { error } = await supabase
        .from('wire_drops')
        .update({
          room_equipment_id: selectedEquipmentId,
          updated_at: new Date().toISOString()
        })
        .eq('id', wireDrop.id);
      
      if (error) throw error;
      
      if (onSave) {
        await onSave({
          ...wireDrop,
          room_equipment_id: selectedEquipmentId
        });
      }
      
      setEquipmentRoomChanges([]);
    } catch (error) {
      throw error;
    }
  };

  const handleRoomChangeConfirm = async () => {
    setShowRoomChangeModal(false);
    setSaving(true);
    
    try {
      for (const change of pendingChanges) {
        const { error } = await supabase
          .from('project_equipment')
          .update({ 
            room: change.newRoom,
            room_name: change.newRoom,
            updated_at: new Date().toISOString()
          })
          .eq('id', change.equipmentId);
        
        if (error) {
          console.error(`Failed to update room for ${change.equipmentName}:`, error);
        }
      }
      
      await saveWireDrop();
      
      setPendingChanges([]);
      setEquipmentRoomChanges([]);
    } catch (error) {
      console.error('Failed to update rooms:', error);
      alert('Failed to update equipment rooms');
    } finally {
      setSaving(false);
    }
  };

  const handleRoomChangeCancel = async () => {
    setShowRoomChangeModal(false);
    setPendingChanges([]);
    setSaving(true);
    
    try {
      await saveWireDrop();
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save wire drop');
    } finally {
      setSaving(false);
    }
  };

  const wireDropRoom = wireDrop.room || wireDrop.room_name || 'Unknown Room';

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Room Equipment</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Equipment for Wire Drop {wireDrop.drop_id || wireDrop.drop_name}
            </label>
            <select 
              value={selectedEquipmentId}
              onChange={(e) => handleEquipmentSelect(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            >
              <option value="">-- Select Equipment --</option>
              
              {sortedEquipment.filter(e => 
                e.room === wireDrop.room || e.room_name === wireDrop.room_name
              ).length > 0 && (
                <optgroup label={`📍 ${wireDropRoom} Equipment`}>
                  {sortedEquipment
                    .filter(e => e.room === wireDrop.room || e.room_name === wireDrop.room_name)
                    .map(equipment => (
                      <option key={equipment.id} value={equipment.id}>
                        {equipment.name} - {equipment.model || 'No Model'}
                      </option>
                    ))}
                </optgroup>
              )}
              
              {sortedEquipment.filter(e => 
                e.room !== wireDrop.room && e.room_name !== wireDrop.room_name
              ).length > 0 && (
                <optgroup label="🏠 Other Rooms">
                  {sortedEquipment
                    .filter(e => e.room !== wireDrop.room && e.room_name !== wireDrop.room_name)
                    .map(equipment => (
                      <option key={equipment.id} value={equipment.id}>
                        {equipment.name} - {equipment.model || 'No Model'} ({equipment.room || equipment.room_name || 'Unassigned'})
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            
            {selectedEquipment && (selectedEquipment.room !== wireDrop.room && selectedEquipment.room_name !== wireDrop.room_name) && (
              <div className="mt-2 flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    This equipment is currently assigned to <strong>{selectedEquipment.room || selectedEquipment.room_name}</strong>.
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                    It will be reassigned to <strong>{wireDropRoom}</strong> when you save.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedEquipment && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{selectedEquipment.name}</h4>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Model:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedEquipment.model || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Manufacturer:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedEquipment.manufacturer || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Current Room:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedEquipment.room || selectedEquipment.room_name || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Serial Number:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedEquipment.serial_number || 'N/A'}</dd>
              </div>
            </dl>
          </div>

          <UniFiClientSelectorEnhanced 
            equipment={selectedEquipment}
            onClientLinked={handleUniFiLink}
          />

          <HomeKitQRUpload
            equipment={selectedEquipment}
            onUpload={handleHomeKitUpload}
          />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition
            ${saving 
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save Equipment Assignment
            </>
          )}
        </button>
      </div>

      {showRoomChangeModal && (
        <RoomChangeConfirmation
          changes={pendingChanges}
          onConfirm={handleRoomChangeConfirm}
          onCancel={handleRoomChangeCancel}
        />
      )}
    </div>
  );
};

export default WireDropEquipmentSection;
