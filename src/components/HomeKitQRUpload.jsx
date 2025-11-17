import React, { useState } from 'react';
import { Camera, Upload, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

const HomeKitQRUpload = ({ 
  equipment, 
  onUpload
}) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(equipment?.homekit_qr_photo || null);
  const [setupCode, setSetupCode] = useState(equipment?.homekit_setup_code || '');
  const [showUploadOptions, setShowUploadOptions] = useState(false);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }
    
    setUploading(true);
    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target.result);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase Storage
      const fileName = `homekit-qr/${equipment.project_id}/${equipment.id}-${Date.now()}.jpg`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('equipment-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('equipment-photos')
        .getPublicUrl(fileName);
      
      // Update database
      const { error: updateError } = await supabase
        .from('project_equipment')
        .update({ 
          homekit_qr_photo: publicUrl,
          homekit_setup_code: setupCode || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', equipment.id);
      
      if (updateError) throw updateError;
      
      if (onUpload) {
        onUpload({
          photo_url: publicUrl,
          setup_code: setupCode
        });
      }
      
      setShowUploadOptions(false);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload HomeKit QR code. Please try again.');
      setPreview(equipment?.homekit_qr_photo || null);
    } finally {
      setUploading(false);
    }
  };

  const handleSetupCodeSave = async () => {
    if (!setupCode.trim()) return;
    
    try {
      const { error } = await supabase
        .from('project_equipment')
        .update({ 
          homekit_setup_code: setupCode.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', equipment.id);
      
      if (error) throw error;
      
      if (onUpload) {
        onUpload({
          photo_url: preview,
          setup_code: setupCode.trim()
        });
      }
    } catch (error) {
      console.error('Failed to save setup code:', error);
      alert('Failed to save HomeKit setup code');
    }
  };

  const handleRemovePhoto = async () => {
    if (!window.confirm('Remove HomeKit QR code photo?')) return;
    
    try {
      const { error } = await supabase
        .from('project_equipment')
        .update({ 
          homekit_qr_photo: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', equipment.id);
      
      if (error) throw error;
      
      setPreview(null);
      if (onUpload) {
        onUpload({
          photo_url: null,
          setup_code: setupCode
        });
      }
    } catch (error) {
      console.error('Failed to remove photo:', error);
      alert('Failed to remove photo');
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">HomeKit QR Code</h4>
        {!preview && (
          <button
            onClick={() => setShowUploadOptions(!showUploadOptions)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Add QR Code
          </button>
        )}
      </div>

      {preview ? (
        <div className="space-y-4">
          <div className="relative bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <img 
              src={preview} 
              alt="HomeKit QR Code" 
              className="w-full max-w-xs mx-auto rounded-lg"
            />
            <button
              onClick={handleRemovePhoto}
              className="absolute top-2 right-2 p-1 bg-red-100 dark:bg-red-900 rounded-full hover:bg-red-200 dark:hover:bg-red-800"
              title="Remove QR Code"
            >
              <X className="w-4 h-4 text-red-600 dark:text-red-400" />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              HomeKit Setup Code (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value)}
                placeholder="XXXX-XXXX"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
              <button
                onClick={handleSetupCodeSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              8-digit setup code from the HomeKit accessory
            </p>
          </div>

          <button
            onClick={() => setShowUploadOptions(true)}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Replace QR Code
          </button>
        </div>
      ) : (
        showUploadOptions && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Upload a photo of the HomeKit QR code for this equipment
              </p>
              
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 
                  border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer
                  hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition
                  ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {uploading ? 'Uploading...' : 'Choose File'}
                  </span>
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>

                <button
                  className={`flex items-center gap-2 px-4 py-3 
                    border-2 border-gray-300 dark:border-gray-600 rounded-lg
                    hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition
                    ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={uploading}
                  onClick={() => {
                    // Trigger native camera on mobile
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.capture = 'environment';
                    input.onchange = handleFileUpload;
                    input.click();
                  }}
                >
                  <Camera className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Take Photo</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Setup Code (Optional)
              </label>
              <input
                type="text"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value)}
                placeholder="XXXX-XXXX"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                You can add this later if needed
              </p>
            </div>

            <button
              onClick={() => setShowUploadOptions(false)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        )
      )}

      {!preview && !showUploadOptions && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No HomeKit QR code attached to this equipment
        </p>
      )}
    </div>
  );
};

export default HomeKitQRUpload;
