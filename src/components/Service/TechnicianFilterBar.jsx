/**
 * TechnicianFilterBar.jsx
 * Top control bar for Weekly Planning view
 * Includes technician selector, view mode toggle, week mode toggle, and navigation
 */

import React, { memo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  User,
  Calendar,
  CalendarDays,
  RefreshCw,
  Code,
  Check,
  Copy
} from 'lucide-react';
import { brandColors } from '../../styles/styleSystem';

/**
 * Format week range for display
 */
const formatWeekRange = (startDate, showWorkWeekOnly) => {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + (showWorkWeekOnly ? 4 : 6));

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
};

/**
 * Check if date is current week
 */
const isCurrentWeek = (startDate) => {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return now >= start && now <= end;
};

/**
 * TechnicianFilterBar Component
 */
const TechnicianFilterBar = ({
  // Technician selection
  technicians = [],
  selectedTechnician,
  onTechnicianChange,
  loadingTechnicians = false,

  // View mode (per-technician vs all)
  viewMode = 'single', // 'single' | 'all'
  onViewModeChange,

  // Week mode (work week vs full week)
  showWorkWeekOnly = true,
  onWeekModeChange,

  // Navigation
  currentWeekStart,
  onPreviousWeek,
  onNextWeek,
  onToday,

  // Refresh
  onRefresh,
  isRefreshing = false,

  // Embed mode (hide some controls)
  isEmbedded = false
}) => {
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const weekRangeText = formatWeekRange(currentWeekStart, showWorkWeekOnly);
  const isThisWeek = isCurrentWeek(currentWeekStart);

  // Generate embed URL - use production domain or current origin
  const getEmbedUrl = () => {
    // Use production Vercel domain when available, otherwise current origin
    const productionDomain = 'https://unicorn-one.vercel.app';
    const baseUrl = window.location.hostname === 'localhost'
      ? productionDomain
      : window.location.origin;
    return `${baseUrl}/service/weekly-planning?embed=true`;
  };

  const getEmbedCode = () => {
    const url = getEmbedUrl();
    // 16:9 aspect ratio: 1920×1080 (1080p)
    return `<iframe src="${url}" width="1920" height="1080" frameborder="0" style="border-radius: 8px;"></iframe>`;
  };

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(getEmbedCode());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(getEmbedUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {/* Technician selector */}
        <div className="flex items-center gap-2">
          <User size={16} className="text-zinc-400" />
          <select
            value={selectedTechnician || 'all'}
            onChange={(e) => onTechnicianChange?.(e.target.value === 'all' ? null : e.target.value)}
            disabled={loadingTechnicians}
            className="px-3 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500 min-w-[180px]"
          >
            <option value="all">All Technicians</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name}{tech.role ? ` (${tech.role})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-zinc-700 rounded-lg p-0.5">
          <button
            onClick={() => onViewModeChange?.('single')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              viewMode === 'single'
                ? 'bg-zinc-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="View single technician"
          >
            <User size={14} />
            <span className="hidden sm:inline">Single</span>
          </button>
          <button
            onClick={() => onViewModeChange?.('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              viewMode === 'all'
                ? 'bg-zinc-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="View all technicians overlapping"
          >
            <Users size={14} />
            <span className="hidden sm:inline">All</span>
          </button>
        </div>

        {/* Week mode toggle */}
        <div className="flex items-center gap-1 bg-zinc-700 rounded-lg p-0.5">
          <button
            onClick={() => onWeekModeChange?.(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              showWorkWeekOnly
                ? 'bg-zinc-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Work week (Mon-Fri)"
          >
            <Calendar size={14} />
            <span className="hidden sm:inline">Mon-Fri</span>
          </button>
          <button
            onClick={() => onWeekModeChange?.(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
              !showWorkWeekOnly
                ? 'bg-zinc-600 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
            title="Full week (Sun-Sat)"
          >
            <CalendarDays size={14} />
            <span className="hidden sm:inline">Full Week</span>
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={onPreviousWeek}
            className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
            title="Previous week"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-white font-medium text-sm min-w-[200px] text-center">
            {weekRangeText}
          </div>

          <button
            onClick={onNextWeek}
            className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
            title="Next week"
          >
            <ChevronRight size={20} />
          </button>

          {!isThisWeek && (
            <button
              onClick={onToday}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{ backgroundColor: brandColors.primary, color: '#fff' }}
            >
              Today
            </button>
          )}
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`p-1.5 rounded-lg hover:bg-zinc-700 transition-colors ${
            isRefreshing ? 'text-zinc-500' : 'text-zinc-400 hover:text-white'
          }`}
          title="Refresh schedules"
        >
          <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
        </button>

        {/* Embed button - only show when not embedded */}
        {!isEmbedded && (
          <button
            onClick={() => setShowEmbedModal(true)}
            className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-white"
            title="Get embed code"
          >
            <Code size={18} />
          </button>
        )}
      </div>

      {/* Legend row */}
      <div className="flex items-center gap-6 mt-3 pt-3 border-t border-zinc-700">
        {/* Status legend */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-zinc-400">Status:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(245, 158, 11, 0.4)', border: '1px solid #F59E0B' }} />
            <span className="text-amber-400">Tentative</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(148, 175, 50, 0.4)', border: `1px solid ${brandColors.success}` }} />
            <span style={{ color: brandColors.success }}>Confirmed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: 'rgba(113, 113, 122, 0.4)', border: '1px solid #71717A' }} />
            <span className="text-zinc-400">Blocked (Calendar)</span>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Time info */}
        <div className="text-xs text-zinc-500">
          30-min buffer between appointments required
        </div>
      </div>

      {/* Embed Code Modal */}
      {showEmbedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Code size={20} />
                Embed Weekly Planning
              </h3>
              <button
                onClick={() => setShowEmbedModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <p className="text-zinc-400 text-sm mb-4">
              Copy the code below to embed this Weekly Planning view in Alleo or any other platform that supports iframes.
            </p>

            {/* Direct URL */}
            <div className="mb-4">
              <label className="block text-sm text-zinc-400 mb-1">Direct URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={getEmbedUrl()}
                  className="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm font-mono"
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 transition-colors text-white flex items-center gap-1"
                  title="Copy URL"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* Iframe Code */}
            <div className="mb-4">
              <label className="block text-sm text-zinc-400 mb-1">Iframe Embed Code</label>
              <div className="relative">
                <textarea
                  readOnly
                  value={getEmbedCode()}
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm font-mono resize-none"
                />
                <button
                  onClick={handleCopyEmbed}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-zinc-600 hover:bg-zinc-500 transition-colors text-white text-xs flex items-center gap-1"
                >
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="bg-zinc-700/50 rounded-lg p-3 text-xs text-zinc-400">
              <strong className="text-zinc-300">Note:</strong> The embed will automatically hide the navigation header for a cleaner integration.
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowEmbedModal(false)}
                className="px-4 py-2 rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(TechnicianFilterBar);
