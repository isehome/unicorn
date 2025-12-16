import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Printer, Loader, Check, X, AlertCircle } from 'lucide-react';
import Modal from './ui/Modal';
import { useTheme } from '../contexts/ThemeContext';

/**
 * PrintLabelModal - Modal for printing wire drop labels
 * Provides options to print 1 or 2 labels, and manually mark as printed
 */
const PrintLabelModal = ({
  isOpen,
  onClose,
  wireDrop,
  printerConnected,
  onPrint,
  onMarkPrinted,
  isPrinting
}) => {
  const { mode } = useTheme();
  const [showUnprintConfirm, setShowUnprintConfirm] = useState(false);
  const [lastPrintStatus, setLastPrintStatus] = useState(null); // 'success' | 'error' | null

  const isAlreadyPrinted = wireDrop?.labels_printed;

  const handlePrint = async (copies) => {
    if (!printerConnected) {
      alert('Please connect to printer first. Go to Settings to connect.');
      return;
    }

    setLastPrintStatus(null);
    try {
      await onPrint(wireDrop, copies);
      // If no error thrown, print succeeded - close modal
      setLastPrintStatus('success');
      // Auto-close after brief success message
      setTimeout(() => {
        handleClose();
      }, 800);
    } catch (err) {
      console.error('Print error:', err);
      setLastPrintStatus('error');
    }
  };

  const handleMarkPrinted = async () => {
    // If currently printed and trying to unmark, show confirmation
    if (isAlreadyPrinted) {
      setShowUnprintConfirm(true);
      return;
    }

    // Mark as printed
    await onMarkPrinted(wireDrop.id, true);
    onClose();
  };

  const handleConfirmUnprint = async () => {
    await onMarkPrinted(wireDrop.id, false);
    setShowUnprintConfirm(false);
    onClose();
  };

  const handleClose = () => {
    setLastPrintStatus(null);
    setShowUnprintConfirm(false);
    onClose();
  };

  if (!wireDrop) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Print Labels - ${wireDrop.drop_name || 'Wire Drop'}`}
      size="sm"
    >
      <div className="space-y-6">
        {/* Wire Drop Info */}
        <div className="text-center pb-4 border-b border-zinc-200 dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">
            {wireDrop.room_name}
            {wireDrop.wire_type && ` - ${wireDrop.wire_type}`}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
            UID: {wireDrop.uid}
          </p>
        </div>

        {/* Printer Status Warning */}
        {!printerConnected && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg"
            style={{
              backgroundColor: mode === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444'
            }}
          >
            <AlertCircle size={18} />
            <span className="text-sm">Printer not connected. Connect in Settings.</span>
          </div>
        )}

        {/* Print Status Feedback */}
        {lastPrintStatus === 'success' && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg"
            style={{
              backgroundColor: 'rgba(148, 175, 50, 0.15)',
              color: '#94AF32'
            }}
          >
            <Check size={18} />
            <span className="text-sm font-medium">Print job sent successfully!</span>
          </div>
        )}
        {lastPrintStatus === 'error' && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg"
            style={{
              backgroundColor: mode === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444'
            }}
          >
            <X size={18} />
            <span className="text-sm font-medium">Print failed. Please try again.</span>
          </div>
        )}

        {/* Print Buttons */}
        <div className="space-y-3">
          {/* Print 1 Label */}
          <button
            type="button"
            onClick={() => handlePrint(1)}
            disabled={isPrinting || !printerConnected}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (!isPrinting && printerConnected) handlePrint(1);
            }}
            className="w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white min-h-[44px] touch-manipulation active:opacity-80"
            style={{ backgroundColor: '#8B5CF6' }}
          >
            {isPrinting ? (
              <Loader size={18} className="animate-spin" />
            ) : (
              <Printer size={18} />
            )}
            <span>Print 1 Label</span>
          </button>

          {/* Print 2 Labels */}
          <button
            type="button"
            onClick={() => handlePrint(2)}
            disabled={isPrinting || !printerConnected}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (!isPrinting && printerConnected) handlePrint(2);
            }}
            className="w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white min-h-[44px] touch-manipulation active:opacity-80"
            style={{ backgroundColor: '#8B5CF6' }}
          >
            {isPrinting ? (
              <Loader size={18} className="animate-spin" />
            ) : (
              <Printer size={18} />
            )}
            <span>Print 2 Labels</span>
          </button>
        </div>

        {/* Divider with text */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
          <span className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">or</span>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
        </div>

        {/* Mark Printed Toggle */}
        <button
          type="button"
          onClick={handleMarkPrinted}
          disabled={isPrinting}
          onTouchEnd={(e) => {
            e.preventDefault();
            if (!isPrinting) handleMarkPrinted();
          }}
          className="w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation active:opacity-80"
          style={isAlreadyPrinted ? {
            backgroundColor: 'rgba(148, 175, 50, 0.15)',
            color: '#94AF32',
            border: '1px solid rgba(148, 175, 50, 0.3)'
          } : {
            backgroundColor: mode === 'dark' ? '#27272a' : '#f4f4f5',
            color: mode === 'dark' ? '#a1a1aa' : '#52525b',
            border: `1px solid ${mode === 'dark' ? '#3f3f46' : '#d4d4d8'}`
          }}
        >
          <Check size={18} />
          <span>{isAlreadyPrinted ? 'Marked as Printed (Tap to Unmark)' : 'Mark as Printed'}</span>
        </button>

        {/* Placeholder for future buttons */}
        {/* Space reserved for 2 more buttons if needed */}

        {/* Unprint Confirmation Dialog */}
        {showUnprintConfirm && (
          <div
            className="p-4 rounded-lg border"
            style={{
              backgroundColor: mode === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
              borderColor: mode === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'
            }}
          >
            <p className="text-sm text-zinc-900 dark:text-zinc-100 mb-3">
              Are you sure you want to mark this as <strong>unprinted</strong>?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowUnprintConfirm(false)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  setShowUnprintConfirm(false);
                }}
                className="flex-1 px-3 py-2 rounded-lg font-medium transition-colors min-h-[44px] touch-manipulation"
                style={{
                  backgroundColor: mode === 'dark' ? '#27272a' : '#f4f4f5',
                  color: mode === 'dark' ? '#a1a1aa' : '#52525b',
                  border: `1px solid ${mode === 'dark' ? '#3f3f46' : '#d4d4d8'}`
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnprint}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleConfirmUnprint();
                }}
                className="flex-1 px-3 py-2 rounded-lg font-medium transition-colors text-white min-h-[44px] touch-manipulation"
                style={{ backgroundColor: '#EF4444' }}
              >
                Yes, Unmark
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

PrintLabelModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  wireDrop: PropTypes.object,
  printerConnected: PropTypes.bool.isRequired,
  onPrint: PropTypes.func.isRequired,
  onMarkPrinted: PropTypes.func.isRequired,
  isPrinting: PropTypes.bool.isRequired
};

export default PrintLabelModal;
