import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import { Search, Filter, Plus } from 'lucide-react';

const WireDropsList = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const sectionStyles = enhancedStyles.sections[mode];
  const [searchTerm, setSearchTerm] = useState('');
  
  const allDrops = [
    { id: 1, projectName: 'Thomas', location: 'Master Bedroom', type: 'CAT6', status: 'pre-wired' },
    { id: 2, projectName: 'Thomas', location: 'Living Room', type: 'CAT6', status: 'installed' },
    { id: 3, projectName: '106 tuna', location: 'Kitchen', type: 'CAT6', status: 'pending' },
    { id: 4, projectName: 'Smith Residence', location: 'Office', type: 'Fiber', status: 'installed' },
  ];

  const filteredDrops = allDrops.filter(drop =>
    drop.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    drop.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    drop.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pb-20">
      <div style={sectionStyles.header} className="shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            All Wire Drops
          </h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div style={sectionStyles.card}>
          <div className="flex gap-2 mb-6">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search drops..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <Button variant="secondary" size="sm" icon={Filter}>
              Filter
            </Button>
            <Button variant="primary" size="sm" icon={Plus}>
              Add
            </Button>
          </div>

          <div className="space-y-3">
            {filteredDrops.map((drop) => (
              <div 
                key={drop.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
                onClick={() => navigate(`/project/${drop.projectName}`)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {drop.location}
                    </h3>
                    <p className="text-sm text-violet-600 dark:text-violet-400">
                      {drop.projectName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Type: {drop.type}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    drop.status === 'installed' 
                      ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                      : drop.status === 'pre-wired'
                      ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300'
                  }`}>
                    {drop.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WireDropsList;
