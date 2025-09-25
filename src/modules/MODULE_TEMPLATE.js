import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const ModuleName = ({ projectId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadData = async () => {
    try {
      // Load your data here
      setLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="py-4 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="py-4">
      {/* Your module content */}
    </div>
  );
};

export default ModuleName;