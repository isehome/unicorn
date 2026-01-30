import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { PrinterProvider } from './contexts/PrinterContext';
import { AppStateProvider } from './contexts/AppStateContext';
import { AIBrainProvider } from './contexts/AIBrainContext';
import { TrainingModeProvider } from './contexts/TrainingModeContext';
import TrainingModePanel from './components/Admin/TrainingModePanel';
import VoiceTestPanel from './components/Admin/VoiceTestPanel';
import UnifiDebug from './components/UnifiDebug';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
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
import BugReporter from './components/BugReporter';
import './index.css';

// Lazy load all route components
const TechnicianDashboard = lazy(() => import('./components/TechnicianDashboard'));
const PMDashboard = lazy(() => import('./components/PMDashboard'));
const ProjectDetailView = lazy(() => import('./components/ProjectDetailView'));
const PMProjectView = lazy(() => import('./components/PMProjectView'));
const PMIssuesPage = lazy(() => import('./components/PMIssuesPage'));
const IssueDetail = lazy(() => import('./components/IssueDetail'));
const PeopleManagement = lazy(() => import('./components/PeopleManagement'));
const ContactDetailPage = lazy(() => import('./components/ContactDetailPage'));
const WireDropsList = lazy(() => import('./components/WireDropsList'));
const WireDropNew = lazy(() => import('./components/WireDropNew'));
const WireDropDetail = lazy(() => import('./components/WireDropDetail'));
const WireDropsHub = lazy(() => import('./components/WireDropsHub'));
const PrewireMode = lazy(() => import('./components/PrewireMode'));
const FloorPlanViewer = lazy(() => import('./pages/FloorPlanViewer'));
const EquipmentListPage = lazy(() => import('./components/EquipmentListPage'));
const SecureDataPage = lazy(() => import('./components/SecureDataPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const AuthCallback = lazy(() => import('./components/AuthCallback'));
const IssuesListPage = lazy(() => import('./components/IssuesListPage'));
const TodosListPage = lazy(() => import('./components/TodosListPage'));
const LucidDiagnostic = lazy(() => import('./components/LucidDiagnostic'));
const UnifiTestPage = lazy(() => import('./components/UnifiTestPage'));
const PartsListPage = lazy(() => import('./components/PartsListPage'));
const PartDetailPage = lazy(() => import('./components/PartDetailPage'));
const PartsAILookupPage = lazy(() => import('./components/PartsAILookupPage'));
const GlobalPartsManager = lazy(() => import('./components/GlobalPartsManager'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const PartsReceivingPage = lazy(() => import('./components/PartsReceivingPage'));
const PMProcurementPage = lazy(() => import('./components/PMOrderEquipmentPage'));
const VendorManagement = lazy(() => import('./components/VendorManagement'));
const ScanTagPage = lazy(() => import('./components/ScanTagPage'));
const PublicIssuePortal = lazy(() => import('./pages/PublicIssuePortal'));
const PublicPurchaseOrderPortal = lazy(() => import('./pages/PublicPurchaseOrderPortal'));
const PublicShadePortal = lazy(() => import('./pages/PublicShadePortal'));
const ProjectReportsPage = lazy(() => import('./pages/ProjectReportsPage'));
const ShadeManager = lazy(() => import('./components/Shades/ShadeManager'));
const ShadeDetailPage = lazy(() => import('./components/Shades/ShadeDetailPage'));
const TodoDetailPage = lazy(() => import('./components/TodoDetailPage'));
const HeadEndToolsPage = lazy(() => import('./components/HeadEndToolsPage'));
const KnowledgeManagementPanel = lazy(() => import('./components/knowledge/KnowledgeManagementPanel'));
const HomeAssistantPage = lazy(() => import('./pages/HomeAssistantPage'));
const RackLayoutPage = lazy(() => import('./pages/RackLayoutPage'));

// Service CRM
const ServiceDashboard = lazy(() => import('./components/Service/ServiceDashboard'));
const ServiceTicketDetail = lazy(() => import('./components/Service/ServiceTicketDetail'));
const NewTicketForm = lazy(() => import('./components/Service/NewTicketForm'));
const WeeklyPlanning = lazy(() => import('./pages/WeeklyPlanning'));
const ServiceReports = lazy(() => import('./pages/ServiceReports'));
const ServiceAITest = lazy(() => import('./pages/ServiceAITest'));

// Admin
const AdminPage = lazy(() => import('./pages/AdminPage'));

// Career Development & HR
const CareerDevelopmentPage = lazy(() => import('./pages/CareerDevelopmentPage'));
const TeamReviewsPage = lazy(() => import('./pages/TeamReviewsPage'));
const MyHRPage = lazy(() => import('./pages/MyHRPage'));


const AppRoutes = () => {
  const location = useLocation();
  const isPublicRoute = location.pathname.startsWith('/public') || location.pathname.startsWith('/shade-portal');
  const isEmbedded = location.search.includes('embed=true');
  const hideChrome = ['/login', '/auth/callback'].includes(location.pathname) || isPublicRoute || isEmbedded;
  const { isOnline } = useNetworkStatus();
  const { pendingCount, isSyncing, triggerSync } = useSyncStatus();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 transition-colors duration-300 flex flex-col">
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
        <ErrorBoundary>
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
                    <TechnicianDashboard />
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
                      <PMProjectView />
                    </OfflineGuard>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pm-project/:projectId"
                element={
                  <ProtectedRoute>
                    <OfflineGuard pageName="PM Project View">
                      <PMProjectView />
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
                path="/contacts/:contactId"
                element={
                  <ProtectedRoute>
                    <ContactDetailPage />
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
                path="/parts/ai-lookup"
                element={
                  <ProtectedRoute>
                    <PartsAILookupPage />
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
                path="/prewire-mode"
                element={
                  <ProtectedRoute>
                    <OfflineGuard pageName="Prewire Mode">
                      <PrewireMode />
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
                      <WireDropDetail />
                    </OfflineGuard>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId/wire-drops/:wireDropId/head-end-tools"
                element={
                  <ProtectedRoute>
                    <HeadEndToolsPage />
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
                path="/projects/:projectId/reports"
                element={
                  <ProtectedRoute>
                    <ProjectReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId/shades"
                element={
                  <ProtectedRoute>
                    <ShadeManager />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId/shades/:shadeId"
                element={
                  <ProtectedRoute>
                    <ShadeDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId/home-assistant"
                element={
                  <ProtectedRoute>
                    <HomeAssistantPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/projects/:projectId/rack-layout"
                element={
                  <ProtectedRoute>
                    <RackLayoutPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vendors"
                element={
                  <ProtectedRoute>
                    <VendorManagement />
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
                path="/settings/knowledge"
                element={
                  <ProtectedRoute>
                    <KnowledgeManagementPanel />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/issues"
                element={
                  <ProtectedRoute>
                    <IssuesListPage />
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
                path="/projects/:projectId/todos/:todoId"
                element={
                  <ProtectedRoute>
                    <TodoDetailPage />
                  </ProtectedRoute>
                }
              />
              {/* Service CRM Routes */}
              <Route
                path="/service"
                element={
                  <ProtectedRoute>
                    <ServiceDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/service/tickets/new"
                element={
                  <ProtectedRoute>
                    <NewTicketForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/service/tickets/:id"
                element={
                  <ProtectedRoute>
                    <ServiceTicketDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/service/weekly-planning"
                element={
                  <ProtectedRoute>
                    <WeeklyPlanning />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/service/reports"
                element={
                  <ProtectedRoute>
                    <ServiceReports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/service/ai-test"
                element={
                  <ProtectedRoute>
                    <ServiceAITest />
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
              <Route path="/debug-unifi" element={<UnifiDebug />} />
              <Route
                path="/voice-test"
                element={
                  <ProtectedRoute>
                    <div className="p-4">
                      <VoiceTestPanel />
                    </div>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
              {/* HR & Career Development Routes */}
              <Route
                path="/my-hr"
                element={
                  <ProtectedRoute>
                    <MyHRPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/career"
                element={
                  <ProtectedRoute>
                    <CareerDevelopmentPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/team-reviews"
                element={
                  <ProtectedRoute>
                    <TeamReviewsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/public/issues/:token" element={<PublicIssuePortal />} />
              <Route path="/public/po/:token" element={<PublicPurchaseOrderPortal />} />
              <Route path="/shade-portal/:token" element={<PublicShadePortal />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <BugReporter />
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
                <AppStateProvider>
                  <AIBrainProvider>
                    <TrainingModeProvider>
                      <AppRoutes />
                      <TrainingModePanel />
                    </TrainingModeProvider>
                  </AIBrainProvider>
                </AppStateProvider>
              </Router>
            </PhotoViewerProvider>
          </PrinterProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
