import React, { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  PackageCheck,
  Shield,
  Image,
  Folder,
  FileText,
  ChevronRight
} from 'lucide-react';
import { normalizeSharePointRootUrl } from '../../services/sharePointFolderService';

/**
 * ProjectLinks - Bottom section with navigation and external links
 *
 * Contains two rows:
 * 1. Navigation buttons (Equipment, Receiving, Secure Data)
 * 2. External link buttons (Photos, Files, Procurement, Portal Proposal)
 */
const ProjectLinks = ({ project, projectId, styles, palette, withAlpha, openLink }) => {
  const navigate = useNavigate();
  const normalizedClientFolder = useMemo(() => {
    if (!project?.client_folder_url) return '';
    const normalized =
      normalizeSharePointRootUrl(project.client_folder_url) || project.client_folder_url.trim();
    return normalized ? normalized.replace(/\/+$/, '') : '';
  }, [project?.client_folder_url]);

  const photosUrl = normalizedClientFolder ? `${normalizedClientFolder}/Photos` : null;
  const filesUrl = normalizedClientFolder ? `${normalizedClientFolder}/Files` : null;
  const procurementUrl = normalizedClientFolder ? `${normalizedClientFolder}/Procurement` : null;

  return (
    <>
      {/* Navigation Buttons Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => navigate(`/projects/${projectId}/equipment`)}
          className="flex items-center justify-between px-4 py-3 rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg group"
          style={styles.card}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: withAlpha(palette.info, 0.1) }}
            >
              <Package size={20} style={{ color: palette.info }} />
            </div>
            <div className="text-left">
              <p className="font-medium" style={styles.textPrimary}>Equipment List</p>
              <p className="text-xs" style={styles.textSecondary}>Manage project equipment</p>
            </div>
          </div>
          <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" style={styles.textSecondary} />
        </button>

        <button
          onClick={() => navigate(`/projects/${projectId}/receiving`)}
          className="flex items-center justify-between px-4 py-3 rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg group"
          style={styles.card}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: withAlpha(palette.success, 0.1) }}
            >
              <PackageCheck size={20} style={{ color: palette.success }} />
            </div>
            <div className="text-left">
              <p className="font-medium" style={styles.textPrimary}>Receive Items</p>
              <p className="text-xs" style={styles.textSecondary}>Log incoming shipments</p>
            </div>
          </div>
          <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" style={styles.textSecondary} />
        </button>

        <button
          onClick={() => navigate(`/projects/${projectId}/secure-data`)}
          className="flex items-center justify-between px-4 py-3 rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg group"
          style={styles.card}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: withAlpha(palette.danger, 0.1) }}
            >
              <Shield size={20} style={{ color: palette.danger }} />
            </div>
            <div className="text-left">
              <p className="font-medium" style={styles.textPrimary}>Secure Data</p>
              <p className="text-xs" style={styles.textSecondary}>Protected credentials</p>
            </div>
          </div>
          <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" style={styles.textSecondary} />
        </button>
      </div>

      {/* External Links Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          disabled={!photosUrl}
          onClick={() => photosUrl && openLink(photosUrl)}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          style={styles.card}
        >
          <Image size={18} style={styles.textSecondary} />
          <span className="text-sm" style={styles.textPrimary}>Photos</span>
        </button>
        <button
          disabled={!filesUrl}
          onClick={() => filesUrl && openLink(filesUrl)}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          style={styles.card}
        >
          <Folder size={18} style={styles.textSecondary} />
          <span className="text-sm" style={styles.textPrimary}>Files</span>
        </button>
        <button
          disabled={!procurementUrl}
          onClick={() => procurementUrl && openLink(procurementUrl)}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          style={styles.card}
        >
          <Package size={18} style={styles.textSecondary} />
          <span className="text-sm" style={styles.textPrimary}>Procurement</span>
        </button>
        <button
          onClick={() => openLink(project.portal_proposal_url)}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          style={styles.card}
        >
          <FileText size={18} style={styles.textSecondary} />
          <span className="text-sm" style={styles.textPrimary}>Portal Proposal</span>
        </button>
      </div>
    </>
  );
};

export default memo(ProjectLinks);
