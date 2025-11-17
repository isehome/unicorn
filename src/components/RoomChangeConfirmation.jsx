import React from 'react';

const RoomChangeConfirmation = ({ changes, onConfirm, onCancel }) => {
  if (changes.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl mx-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Confirm Equipment Room Updates
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          The following equipment will be reassigned to match the wire drop room:
        </p>
        <ul className="space-y-2 mb-6">
          {changes.map((change, index) => (
            <li key={change.equipmentId || index} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <div className="font-medium text-gray-900 dark:text-gray-100">{change.equipmentName}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {change.oldRoom} → {change.newRoom}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Confirm Changes
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition"
          >
            Keep Original Rooms
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomChangeConfirmation;
