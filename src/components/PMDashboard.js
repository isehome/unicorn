import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import { Plus, FileText, Image, Package, ExternalLink } from 'lucide-react';

const PMDashboard = () => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const [newProject, setNewProject] = useState({
    name: '',
    address: '',
    lucidChartUrl: '',
    portalProposalUrl: '',
    oneDrivePhotos: '',
    oneDriveFiles: '',
    oneDriveProcurement: '',
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div style={sectionStyles.header} className="shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-500 to-cyan-500 bg-clip-text text-transparent">
            Project Manager Dashboard
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Create New Project */}
        <div style={sectionStyles.card} className="mb-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
            Create New Project
          </h2>
          
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  placeholder="Enter project name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Address *
                </label>
                <input
                  type="text"
                  value={newProject.address}
                  onChange={(e) => setNewProject({...newProject, address: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  placeholder="Enter project address"
                />
              </div>
            </div>

            {/* Required URLs */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
                Required Documentation
              </h3>
              
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    LucidChart Wiring Diagram URL *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newProject.lucidChartUrl}
                      onChange={(e) => setNewProject({...newProject, lucidChartUrl: e.target.value})}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      placeholder="https://lucid.app/..."
                    />
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Portal Proposal URL *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newProject.portalProposalUrl}
                      onChange={(e) => setNewProject({...newProject, portalProposalUrl: e.target.value})}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                      placeholder="https://portal..."
                    />
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* OneDrive Links */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
                OneDrive Folders
              </h3>
              
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    <Image className="w-4 h-4 inline mr-1" />
                    Photos Folder
                  </label>
                  <input
                    type="url"
                    value={newProject.oneDrivePhotos}
                    onChange={(e) => setNewProject({...newProject, oneDrivePhotos: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="OneDrive photos link"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Files Folder
                  </label>
                  <input
                    type="url"
                    value={newProject.oneDriveFiles}
                    onChange={(e) => setNewProject({...newProject, oneDriveFiles: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="OneDrive files link"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    <Package className="w-4 h-4 inline mr-1" />
                    Procurement Folder
                  </label>
                  <input
                    type="url"
                    value={newProject.oneDriveProcurement}
                    onChange={(e) => setNewProject({...newProject, oneDriveProcurement: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    placeholder="OneDrive procurement link"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <Button variant="primary" size="md" icon={Plus}>
                Create Project
              </Button>
              <Button variant="secondary" size="md">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PMDashboard;
