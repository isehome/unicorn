/**
 * AITrainingTab.js
 * Admin tab for managing AI page training
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Play, Eye, EyeOff, CheckCircle, AlertCircle,
  Loader2, RefreshCw, Sparkles
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useTrainingMode } from '../../contexts/TrainingModeContext';
import { pageContextService } from '../../services/pageContextService';
import { getAllRoutes, PAGE_REGISTRY } from '../../config/pageRegistry';

const AITrainingTab = () => {
  const { mode } = useTheme();
  const navigate = useNavigate();
  const { enterTrainingMode, isTrainingMode } = useTrainingMode();

  const [trainingStatus, setTrainingStatus] = useState({
    total: 0,
    trained: 0,
    published: 0,
    pages: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Styles
  const textPrimary = mode === 'dark' ? 'text-white' : 'text-gray-900';
  const textSecondary = mode === 'dark' ? 'text-zinc-400' : 'text-gray-500';
  const cardBg = mode === 'dark' ? 'bg-zinc-800' : 'bg-white';
  const borderColor = mode === 'dark' ? 'border-zinc-700' : 'border-gray-200';

  /**
   * Load training status from database (auto-initializes missing pages)
   */
  const loadTrainingStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Auto-initialize all pages from registry first (idempotent - skips existing)
      await pageContextService.initializeFromRegistry(PAGE_REGISTRY);

      const status = await pageContextService.getTrainingStatus();
      const allRoutes = getAllRoutes();

      // Merge registry with database status
      const merged = allRoutes.map(route => {
        const dbStatus = status.pages.find(p => p.page_route === route.route);
        return {
          ...route,
          is_trained: dbStatus?.is_trained || false,
          is_published: dbStatus?.is_published || false,
          training_version: dbStatus?.training_version || 0,
          last_trained_at: dbStatus?.last_trained_at,
          page_title: dbStatus?.page_title || route.pageTitle,
        };
      });

      const trainedCount = merged.filter(p => p.is_trained).length;
      const publishedCount = merged.filter(p => p.is_published).length;

      setTrainingStatus({
        total: allRoutes.length,
        trained: trainedCount,
        published: publishedCount,
        untrained: allRoutes.length - trainedCount,
        pages: merged,
      });
    } catch (err) {
      console.error('Error loading training status:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrainingStatus();
  }, [loadTrainingStatus]);

  /**
   * Handle publish/unpublish
   */
  const handleTogglePublish = async (pageRoute, isPublished) => {
    try {
      if (isPublished) {
        await pageContextService.unpublishTraining(pageRoute);
      } else {
        await pageContextService.publishTraining(pageRoute);
      }
      await loadTrainingStatus();
    } catch (err) {
      console.error('Error toggling publish:', err);
    }
  };

  /**
   * Navigate to page and enter training mode
   */
  const handleTrainPage = (route) => {
    enterTrainingMode();
    // Convert pattern route to actual navigable route
    const navigableRoute = route.replace(/:[\w]+/g, 'demo');
    navigate(navigableRoute);
  };

  const trainedCount = trainingStatus.trained;
  const progressPercent = trainingStatus.total > 0
    ? Math.round((trainedCount / trainingStatus.total) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Enter Training Mode button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-xl font-semibold ${textPrimary}`}>AI Brain Training</h2>
          <p className={textSecondary}>
            Train the AI to understand each page and teach users
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              enterTrainingMode();
              navigate('/');
            }}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Bot className="w-5 h-5" />
            {isTrainingMode ? 'Training Mode Active' : 'Enter Training Mode'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-lg ${cardBg} border ${borderColor}`}>
          <p className={textSecondary}>Total Pages</p>
          <p className={`text-2xl font-bold ${textPrimary}`}>{trainingStatus.total}</p>
        </div>
        <div className={`p-4 rounded-lg ${cardBg} border ${borderColor}`}>
          <p className={textSecondary}>Trained</p>
          <p className="text-2xl font-bold text-green-500">{trainedCount}</p>
        </div>
        <div className={`p-4 rounded-lg ${cardBg} border ${borderColor}`}>
          <p className={textSecondary}>Published</p>
          <p className="text-2xl font-bold text-blue-500">{trainingStatus.published}</p>
        </div>
        <div className={`p-4 rounded-lg ${cardBg} border ${borderColor}`}>
          <p className={textSecondary}>Untrained</p>
          <p className="text-2xl font-bold text-yellow-500">{trainingStatus.untrained}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className={`p-4 rounded-lg ${cardBg} border ${borderColor}`}>
        <div className="flex justify-between mb-2">
          <span className={textSecondary}>Training Progress</span>
          <span className={textPrimary}>{progressPercent}%</span>
        </div>
        <div className={`w-full h-3 ${mode === 'dark' ? 'bg-zinc-700' : 'bg-gray-200'} rounded-full overflow-hidden`}>
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Page list */}
      <div className={`rounded-lg border ${borderColor} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`${mode === 'dark' ? 'bg-zinc-800' : 'bg-gray-50'}`}>
              <tr>
                <th className={`px-4 py-3 text-left text-sm font-medium ${textSecondary}`}>Page</th>
                <th className={`px-4 py-3 text-left text-sm font-medium ${textSecondary}`}>Route</th>
                <th className={`px-4 py-3 text-center text-sm font-medium ${textSecondary}`}>Status</th>
                <th className={`px-4 py-3 text-center text-sm font-medium ${textSecondary}`}>Version</th>
                <th className={`px-4 py-3 text-right text-sm font-medium ${textSecondary}`}>Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${borderColor}`}>
              {trainingStatus.pages.map((page) => (
                <tr key={page.route} className={`${cardBg} hover:bg-zinc-700/30`}>
                  <td className={`px-4 py-3 ${textPrimary}`}>
                    <div className="font-medium">{page.page_title || page.pageTitle || page.componentName}</div>
                    <div className={`text-xs ${textSecondary}`}>{page.componentName}</div>
                  </td>
                  <td className={`px-4 py-3 text-sm ${textSecondary}`}>
                    <code className="text-xs bg-zinc-700/50 px-1 py-0.5 rounded">{page.route}</code>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {page.is_trained ? (
                      page.is_published ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                          <CheckCircle className="w-3 h-3" />
                          Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                          <CheckCircle className="w-3 h-3" />
                          Trained
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                        <AlertCircle className="w-3 h-3" />
                        Untrained
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-center text-sm ${textSecondary}`}>
                    v{page.training_version || 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleTrainPage(page.route)}
                        className={`p-1.5 rounded hover:bg-purple-500/20 text-purple-400`}
                        title="Train this page"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      {page.is_trained && !page.is_published && (
                        <button
                          onClick={() => handleTogglePublish(page.route, false)}
                          className="p-1.5 rounded hover:bg-green-500/20 text-green-400"
                          title="Publish training"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {page.is_published && (
                        <button
                          onClick={() => handleTogglePublish(page.route, true)}
                          className={`p-1.5 rounded hover:bg-zinc-600 ${textSecondary}`}
                          title="Unpublish"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* How it works */}
      <div className={`p-4 rounded-lg ${cardBg} border ${borderColor}`}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h3 className={`font-semibold ${textPrimary}`}>How Brain Training Works</h3>
        </div>
        <div className={`text-sm ${textSecondary} space-y-2`}>
          <p>1. <strong>Enter Training Mode</strong> - Click the button above to activate the floating training panel</p>
          <p>2. <strong>Navigate to a Page</strong> - Go to any page in the app you want to train</p>
          <p>3. <strong>Start Training</strong> - Use voice or text to explain what the page does, common mistakes, and best practices</p>
          <p>4. <strong>Save & Publish</strong> - Save your training and publish it to make it available to users</p>
          <p>5. <strong>AI Teaches Users</strong> - The AI can now help users understand and use that page effectively</p>
        </div>
      </div>
    </div>
  );
};

export default AITrainingTab;
