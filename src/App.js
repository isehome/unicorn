import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { PrinterProvider } from './contexts/PrinterContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppHeader from './components/AppHeader';
import BottomNavigation from './components/BottomNavigation';
import LoadingSpinner from './components/ui/LoadingSpinner';
import Login from './components/Login';
import { OfflineBanner } from './components/OfflineBanner';
import { OfflineGuard } from './components/OfflineGuard';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useSyncStatus } from './components/SyncStatus';
import { thumbnailCache } from './lib/thumbnailCache';
import { PhotoViewerProvider } from './components/photos/PhotoViewerProvider';
import './index.css';

// Lazy load all route components
const TechnicianDashboardOptimized = lazy(() => import('./components/TechnicianDashboardOptimized'));
const PMDashboard = lazy(() => import('./components/PMDashboard'));
const ProjectDetailView = lazy(() => import('./components/ProjectDetailView'));
const PMProjectViewEnhanced = lazy(() => import('./components/PMProjectViewEnhanced'));
const PMIssuesPage = lazy(() => import('./components/PMIssuesPage'));
const IssueDetail = lazy(() => import('./components/IssueDetail'));
const PeopleManagement = lazy(() => import('./components/PeopleManagement'));
const WireDropsList = lazy(() => import('./components/WireDropsList'));
const WireDropNew = lazy(() => import('./components/WireDropNew'));
const WireDropDetailEnhanced = lazy(() => import('./components/WireDropDetailEnhanced'));
const WireDropsHub = lazy(() => import('./components/WireDropsHub'));
const FloorPlanViewer = lazy(() => import('./pages/FloorPlanViewer'));
const EquipmentListPage = lazy(() => import('./components/EquipmentListPage'));
const SecureDataPage = lazy(() => import('./components/SecureDataPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const AuthCallback = lazy(() => import('./components/AuthCallback'));
const IssuesListPageOptimized = lazy(() => import('./components/IssuesListPageOptimized'));
const TodosListPage = lazy(() => import('./components/TodosListPage'));
const LucidDiagnostic = lazy(() => import('./components/LucidDiagnostic'));
const UnifiTestPage = lazy(() => import('./components/UnifiTestPage'));
const PartsListPage = lazy(() => import('./components/PartsListPage'));
const PartDetailPage = lazy(() => import('./components/PartDetailPage'));
const GlobalPartsManager = lazy(() => import('./components/GlobalPartsManager'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const PartsReceivingPage = lazy(() => import('./components/PartsReceivingPageNew'));
const PMProcurementPage = lazy(() => import('./components/PMOrderEquipmentPageEnhanced'));
const ScanTagPage = lazy(() => import('./components/ScanTagPage'));

const AppRoutes = () => {
  const location = useLocation();
  const hideChrome = ['/login', '/auth/callback'].includes(location.pathname);
  const { isOnline } = useNetworkStatus();
  const { pendingCount, isSyncing, triggerSync } = useSyncStatus();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 flex flex-col">
      {!hideChrome && <AppHeader />}
      {!hideChrome && (
        <OfflineBanner
          isOnline={isOnline}
          pendingCount={pendingCount}
          isSyncing={isSyncing}
          onSyncNow={triggerSync}
        />
      )}
      <main className={`flex-1 ${hideChrome ? '' : 'pt-4 sm:pt-6'} ${hideChrome ? '' : 'pb-24'}`}>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <LoadingSpinner size="lg" message="Loading page..." />
          </div>
        }>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TechnicianDashboardOptimized />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pm-dashboard"
            element={
              <ProtectedRoute>
                <PMDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/project/:id"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="Project details">
                  <ProjectDetailView />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pm/project/:projectId"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="PM Project View">
                  <PMProjectViewEnhanced />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pm-project/:projectId"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="PM Project View">
                  <PMProjectViewEnhanced />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/project/:projectId/pm-issues"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="Issues list">
                  <PMIssuesPage />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/project/:id/issues/:issueId"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="Issue details">
                  <IssueDetail />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/people"
            element={
              <ProtectedRoute>
                <PeopleManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/parts"
            element={
              <ProtectedRoute>
                <PartsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/parts/:partId"
            element={
              <ProtectedRoute>
                <PartDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/global-parts"
            element={
              <ProtectedRoute>
                <GlobalPartsManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wire-drops"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="Wire Drops Hub">
                  <WireDropsHub />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/wire-drops-list"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="Wire Drops list">
                  <WireDropsList />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/wire-drops/new"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="New Wire Drop">
                  <WireDropNew />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/wire-drops/:id"
            element={
              <ProtectedRoute>
                <OfflineGuard pageName="Wire Drop details">
                  <WireDropDetailEnhanced />
                </OfflineGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/floor-plan"
            element={
              <ProtectedRoute>
                <FloorPlanViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/equipment"
            element={
              <ProtectedRoute>
                <EquipmentListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/inventory"
            element={
              <ProtectedRoute>
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/receiving"
            element={
              <ProtectedRoute>
                <PartsReceivingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/procurement"
            element={
              <ProtectedRoute>
                <PMProcurementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:projectId/secure-data"
            element={
              <ProtectedRoute>
                <SecureDataPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/issues"
            element={
              <ProtectedRoute>
                <IssuesListPageOptimized />
              </ProtectedRoute>
            }
          />
          <Route
            path="/todos"
            element={
              <ProtectedRoute>
                <TodosListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lucid-test"
            element={
              <ProtectedRoute>
                <LucidDiagnostic />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan-tag"
            element={
              <ProtectedRoute>
                <ScanTagPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/unifi-test"
            element={
              <ProtectedRoute>
                <UnifiTestPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!hideChrome && <BottomNavigation />}
    </div>
  );
};

function App() {
  // Background cleanup of expired thumbnail cache entries
  useEffect(() => {
    const cleanupCache = async () => {
      try {
        await thumbnailCache.cleanup();
        console.log('[App] Thumbnail cache cleanup completed');
      } catch (error) {
        console.error('[App] Failed to cleanup thumbnail cache:', error);
      }
    };

    // Run cleanup on mount (non-blocking)
    cleanupCache();

    // Optionally run periodic cleanup (every 24 hours)
    const interval = setInterval(cleanupCache, 24 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <PrinterProvider>
            <PhotoViewerProvider>
              <Router>
                <AppRoutes />
              </Router>
            </PhotoViewerProvider>
          </PrinterProvider>
        </AuthProvider>
      </ThemeProvider>
      {/* ReactQuery DevTools removed - not needed for production */}
    </QueryClientProvider>
  );
}

export default App;
