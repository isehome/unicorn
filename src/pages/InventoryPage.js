import React from 'react';
import { useParams } from 'react-router-dom';
import InventoryManager from '../components/InventoryManager';

const InventoryPage = () => {
  const { projectId } = useParams();

  return (
    <div className="container mx-auto px-4 py-6">
      <InventoryManager projectId={projectId} />
    </div>
  );
};

export default InventoryPage;
