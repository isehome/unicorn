import React, { useState, useEffect } from 'react';
import { Camera, Plus, Search, Eye, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';

const WireDropsModule = ({ projectId }) => {
  const [wireDrops, setWireDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [selectedDrop, setSelectedDrop] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchWireDrops();
    }
  }, [projectId]);

  const fetchWireDrops = async () => {
    try {
      setLoading(true);
      const { data: dropsData, error: dropsError } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId)
        .order('uid');

      if (!dropsError) setWireDrops(dropsData || []);
    } catch (err) {
      console.error('Error fetching wire drops:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (dropId, photoType) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const photoUrl = URL.createObjectURL(file);
        
        const updateData = {};
        updateData[photoType] = photoUrl;
        
        const { error } = await supabase
          .from('wire_drops')
          .update(updateData)
          .eq('id', dropId);

        if (error) throw error;
        
        fetchWireDrops();
      } catch (err) {
        console.error('Error uploading photo:', err);
        alert('Failed to upload photo');
      }
    };
    
    input.click();
  };

  const handleAddWireDrop = async () => {
    const uid = prompt('Wire Drop UID (e.g., LR-001):');
    if (!uid) return;
    
    const name = prompt('Wire Drop Name:');
    if (!name) return;
    
    const location = prompt('Location:');
    if (!location) return;

    try {
      const { error } = await supabase
        .from('wire_drops')
        .insert({
          project_id: projectId,
          uid: uid,
          name: name,
          location: location,
          type: 'CAT6'
        });

      if (error) throw error;
      fetchWireDrops();
    } catch (err) {
      console.error('Error adding wire drop:', err);
      alert('Failed to add wire drop');
    }
  };

  const filteredDrops = wireDrops.filter(drop =>
    drop.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    drop.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    drop.uid?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading wire drops...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Wire Drops ({wireDrops.length})
        </h2>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search drops..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <Button variant="primary" size="sm" icon={Plus} onClick={handleAddWireDrop}>
            Add Drop
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredDrops.map((drop) => (
          <div 
            key={drop.id}
            onClick={() => { setSelectedDrop(drop); setShowDetails(true); }}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {drop.uid}
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {drop.name}
                  </h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  📍 {drop.location} • {drop.type}
                </p>
                
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      drop.prewire_photo ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Pre-wired
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePhotoUpload(drop.id, 'prewire_photo');
                      }}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    >
                      <Camera className="w-4 h-4 text-violet-500" />
                    </button>
                    {drop.prewire_photo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenImage(drop.prewire_photo);
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      >
                        <Eye className="w-4 h-4 text-blue-500" />
                      </button>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      drop.installed_photo ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Installed
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePhotoUpload(drop.id, 'installed_photo');
                      }}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    >
                      <Camera className="w-4 h-4 text-violet-500" />
                    </button>
                    {drop.installed_photo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFullscreenImage(drop.installed_photo);
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      >
                        <Eye className="w-4 h-4 text-blue-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Wire Drop Details Modal */}
      {showDetails && selectedDrop && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedDrop.name} Details</h2>
              <button onClick={() => setShowDetails(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-900 dark:text-white"><strong>UID:</strong> {selectedDrop.uid}</p>
              <p className="text-gray-900 dark:text-white"><strong>Location:</strong> {selectedDrop.location}</p>
              <p className="text-gray-900 dark:text-white"><strong>Type:</strong> {selectedDrop.type}</p>
              {/* Add more details as needed */}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Modal */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => setFullscreenImage(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setFullscreenImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Fullscreen" 
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
  );
};

export default WireDropsModule;