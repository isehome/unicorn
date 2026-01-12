/**
 * TechnicianDropdown.jsx
 * Reusable dropdown for selecting technicians with skill matching
 * Shows qualified technicians first based on ticket category, with avatars and proficiency badges
 */

import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, CheckCircle, Loader2 } from 'lucide-react';
import TechnicianAvatar, { UnassignedAvatar } from '../TechnicianAvatar';
import { technicianService } from '../../services/serviceTicketService';
import { brandColors } from '../../styles/styleSystem';

/**
 * Proficiency badge colors
 */
const proficiencyColors = {
  expert: { bg: '#10B98120', color: '#10B981', border: '#10B981', label: '★ Expert' },
  proficient: { bg: '#3B82F620', color: '#3B82F6', border: '#3B82F6', label: '● Proficient' },
  training: { bg: '#F59E0B20', color: '#F59E0B', border: '#F59E0B', label: '○ Training' },
  none: { bg: '#71717A20', color: '#71717A', border: '#71717A', label: '' }
};

/**
 * TechnicianDropdown Component
 *
 * @param {Object} props
 * @param {string} props.value - Currently selected technician ID
 * @param {string} props.selectedName - Optional pre-known name to show before technicians load
 * @param {string} props.selectedColor - Optional pre-known avatar color to show before technicians load
 * @param {string} props.category - Ticket category for skill matching (e.g., 'network', 'av')
 * @param {Array} props.technicians - Optional pre-loaded technicians array (if not provided, will fetch)
 * @param {function} props.onChange - Callback when selection changes: (techId, techName, avatarColor) => void
 * @param {string} props.size - Size variant: 'sm' | 'md' (default: 'sm')
 * @param {boolean} props.disabled - Whether dropdown is disabled
 * @param {string} props.placeholder - Placeholder text when no selection
 * @param {boolean} props.showUnassignOption - Whether to show unassign option (default: true)
 * @param {string} props.className - Additional CSS classes for the container
 */
const TechnicianDropdown = memo(({
  value,
  selectedName,
  selectedColor,
  category = 'general',
  technicians: propTechnicians,
  onChange,
  size = 'sm',
  disabled = false,
  placeholder = 'Unassigned',
  showUnassignOption = true,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [technicians, setTechnicians] = useState(propTechnicians || []);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Find currently selected technician from loaded list, or use pre-known props
  const selectedTech = technicians.find(t => t.id === value);
  // Use pre-known name/color if technician list hasn't loaded yet
  const displayName = selectedTech?.full_name || selectedName;
  const displayColor = selectedTech?.avatar_color || selectedColor;

  // Load technicians with skill matching when dropdown opens
  // ALWAYS fetch fresh skill-qualified data to ensure consistent sorting
  const loadTechnicians = useCallback(async () => {
    try {
      setLoading(true);
      const data = await technicianService.getAllWithSkills(category);
      setTechnicians(data || []);
    } catch (err) {
      console.error('[TechnicianDropdown] Failed to load technicians:', err);
      // Fallback to prop technicians or basic list
      if (propTechnicians && propTechnicians.length > 0) {
        setTechnicians(propTechnicians);
      } else {
        try {
          const fallbackData = await technicianService.getAll();
          setTechnicians(fallbackData || []);
        } catch (fallbackErr) {
          console.error('[TechnicianDropdown] Fallback also failed:', fallbackErr);
          setTechnicians([]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [category, propTechnicians]);

  // Load technicians when dropdown opens - always fetch fresh skill-qualified data
  useEffect(() => {
    if (isOpen) {
      loadTechnicians();
    }
  }, [isOpen, loadTechnicians]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Handle selection
  const handleSelect = (tech) => {
    onChange?.(tech?.id || null, tech?.full_name || null, tech?.avatar_color || null);
    setIsOpen(false);
  };

  // Size configurations
  const sizes = {
    sm: {
      button: 'px-2 py-1.5',
      avatar: 'xs',
      text: 'text-xs',
      dropdown: 'max-h-48',
      item: 'px-2 py-1.5',
      badge: 'text-[10px] px-1 py-0.5'
    },
    md: {
      button: 'px-3 py-2',
      avatar: 'sm',
      text: 'text-sm',
      dropdown: 'max-h-64',
      item: 'px-3 py-2',
      badge: 'text-xs px-1.5 py-0.5'
    }
  };

  const sizeConfig = sizes[size] || sizes.sm;

  // Split technicians into qualified and other
  const qualifiedTechs = technicians.filter(t => t.qualified);
  const otherTechs = technicians.filter(t => !t.qualified);
  const hasQualificationData = technicians.some(t => t.hasOwnProperty('qualified'));

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1.5 w-full ${sizeConfig.button} rounded bg-black/20 hover:bg-black/30 transition-colors border border-transparent hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {displayName ? (
          <TechnicianAvatar
            name={displayName}
            color={displayColor}
            size={sizeConfig.avatar}
          />
        ) : (
          <UnassignedAvatar size={sizeConfig.avatar} />
        )}
        <span className={`${sizeConfig.text} text-zinc-300 truncate flex-1 text-left`}>
          {displayName || placeholder}
        </span>
        <ChevronDown
          size={size === 'sm' ? 12 : 14}
          className={`text-zinc-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl z-50 ${sizeConfig.dropdown} overflow-y-auto`}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-zinc-400">
              <Loader2 size={14} className="animate-spin" />
              <span className={sizeConfig.text}>Loading...</span>
            </div>
          ) : (
            <>
              {/* Unassign Option */}
              {showUnassignOption && (
                <button
                  type="button"
                  onClick={() => handleSelect(null)}
                  className={`flex items-center gap-2 w-full ${sizeConfig.item} text-left hover:bg-zinc-800 transition-colors`}
                >
                  <UnassignedAvatar size={sizeConfig.avatar} />
                  <span className={`${sizeConfig.text} text-zinc-400`}>{placeholder}</span>
                  {!value && (
                    <CheckCircle size={14} className="ml-auto" style={{ color: brandColors.success }} />
                  )}
                </button>
              )}

              {/* Qualified Technicians Section */}
              {hasQualificationData && qualifiedTechs.length > 0 && (
                <>
                  <div className={`${sizeConfig.text} text-zinc-500 font-medium px-2 py-1.5 border-b border-zinc-700 bg-zinc-800/50`}>
                    ✓ Qualified for {category || 'this category'}
                  </div>
                  {qualifiedTechs.map(tech => {
                    const proficiency = proficiencyColors[tech.highestProficiency] || proficiencyColors.none;
                    return (
                      <button
                        key={tech.id}
                        type="button"
                        onClick={() => handleSelect(tech)}
                        className={`flex items-center gap-2 w-full ${sizeConfig.item} text-left hover:bg-zinc-800 transition-colors border-l-2`}
                        style={{ borderLeftColor: proficiency.border }}
                      >
                        <TechnicianAvatar
                          name={tech.full_name}
                          color={tech.avatar_color}
                          size={sizeConfig.avatar}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`${sizeConfig.text} text-white truncate`}>
                              {tech.full_name}
                            </span>
                            {proficiency.label && (
                              <span
                                className={`${sizeConfig.badge} rounded flex-shrink-0`}
                                style={{ backgroundColor: proficiency.bg, color: proficiency.color }}
                              >
                                {proficiency.label}
                              </span>
                            )}
                          </div>
                          {tech.role && (
                            <div className="text-[10px] text-zinc-500 truncate">
                              {tech.role}{tech.skillCount > 0 ? ` • ${tech.skillCount} skill${tech.skillCount !== 1 ? 's' : ''}` : ''}
                            </div>
                          )}
                        </div>
                        {value === tech.id && (
                          <CheckCircle size={14} className="flex-shrink-0" style={{ color: brandColors.success }} />
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Other Technicians Section */}
              {hasQualificationData && otherTechs.length > 0 && (
                <>
                  <div className={`${sizeConfig.text} text-zinc-500 font-medium px-2 py-1.5 border-b border-zinc-700 bg-zinc-800/50 ${qualifiedTechs.length > 0 ? 'mt-1' : ''}`}>
                    Other Technicians
                  </div>
                  {otherTechs.map(tech => (
                    <button
                      key={tech.id}
                      type="button"
                      onClick={() => handleSelect(tech)}
                      className={`flex items-center gap-2 w-full ${sizeConfig.item} text-left hover:bg-zinc-800 transition-colors`}
                    >
                      <TechnicianAvatar
                        name={tech.full_name}
                        color={tech.avatar_color}
                        size={sizeConfig.avatar}
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`${sizeConfig.text} text-white truncate block`}>
                          {tech.full_name}
                        </span>
                        {tech.role && (
                          <div className="text-[10px] text-zinc-500 truncate">{tech.role}</div>
                        )}
                      </div>
                      {value === tech.id && (
                        <CheckCircle size={14} className="flex-shrink-0" style={{ color: brandColors.success }} />
                      )}
                    </button>
                  ))}
                </>
              )}

              {/* Fallback: No qualification data */}
              {!hasQualificationData && technicians.map(tech => (
                <button
                  key={tech.id}
                  type="button"
                  onClick={() => handleSelect(tech)}
                  className={`flex items-center gap-2 w-full ${sizeConfig.item} text-left hover:bg-zinc-800 transition-colors`}
                >
                  <TechnicianAvatar
                    name={tech.full_name}
                    color={tech.avatar_color}
                    size={sizeConfig.avatar}
                  />
                  <div className="flex-1 min-w-0">
                    <span className={`${sizeConfig.text} text-white truncate block`}>
                      {tech.full_name}
                    </span>
                    {tech.role && (
                      <div className="text-[10px] text-zinc-500 truncate">{tech.role}</div>
                    )}
                  </div>
                  {value === tech.id && (
                    <CheckCircle size={14} className="flex-shrink-0" style={{ color: brandColors.success }} />
                  )}
                </button>
              ))}

              {/* Empty state */}
              {technicians.length === 0 && !loading && (
                <div className={`${sizeConfig.text} text-zinc-500 text-center py-4`}>
                  No technicians available
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

TechnicianDropdown.displayName = 'TechnicianDropdown';

export default TechnicianDropdown;
