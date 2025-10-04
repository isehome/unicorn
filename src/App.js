import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import TechnicianDashboardOptimized from './components/TechnicianDashboardOptimized';
import PMDashboard from './components/PMDashboard';
import ProjectDetailView from './components/ProjectDetailView';
import PMProjectViewEnhanced from './components/PMProjectViewEnhanced';
import PMIssuesPage from './components/PMIssuesPage';
import IssueDetail from './components/IssueDetail';
import PeopleManagement from './components/PeopleManagement';
import WireDropsList from './components/WireDropsList';
import WireDropNew from './components/WireDropNew';
import WireDropDetailEnhanced from './components/WireDropDetailEnhanced';
import WireDropsHub from './components/WireDropsHub';
import FloorPlanViewer from './pages/FloorPlanViewer';
import LucidTest from './components/LucidTest';
import LucidChartTest from './components/LucidChartTest';
import LucidChartDebug from './components/LucidChartDebug';
import EquipmentListPage from './components/EquipmentListPage';
import SecureDataPage from './components/SecureDataPage';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AppHeader from './components/AppHeader';
import SettingsPage from './components/SettingsPage';
import BottomNavigation from './components/BottomNavigation';
import AuthCallback from './components/AuthCallback';
import IssuesListPageOptimized from './components/IssuesListPageOptimized';
import TodosListPage from './components/TodosListPage';
import WireDropDeleteTest from './components/WireDropDeleteTest';
import './index.css';

const AppRoutes = () => {
  const location = useLocation();
  const hideChrome = ['/login', '/auth/callback'].includes(location.pathname);

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 ${hideChrome ? '' : 'pb-20'}`}>
      {!hideChrome && <AppHeader />}
      <main className={`${hideChrome ? '' : 'pt-4 sm:pt-6'} pb-6`}>
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
                <ProjectDetailView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pm/project/:projectId"
            element={
              <ProtectedRoute>
                <PMProjectViewEnhanced />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pm-project/:projectId"
            element={
              <ProtectedRoute>
                <PMProjectViewEnhanced />
              </ProtectedRoute>
            }
          />
          <Route
            path="/project/:projectId/pm-issues"
            element={
              <ProtectedRoute>
                <PMIssuesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/project/:id/issues/:issueId"
            element={
              <ProtectedRoute>
                <IssueDetail />
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
            path="/wire-drops"
            element={
              <ProtectedRoute>
                <WireDropsHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wire-drops-list"
            element={
              <ProtectedRoute>
                <WireDropsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lucid-test"
            element={
              <ProtectedRoute>
                <LucidTest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lucid-chart-test"
            element={
              <ProtectedRoute>
                <LucidChartTest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lucid-chart-debug"
            element={
              <ProtectedRoute>
                <LucidChartDebug />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wire-drops/new"
            element={
              <ProtectedRoute>
                <WireDropNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wire-drops/:id"
            element={
              <ProtectedRoute>
                <WireDropDetailEnhanced />
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
            path="/test/wire-drop-delete"
            element={
              <ProtectedRoute>
                <WireDropDeleteTest />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!hideChrome && <BottomNavigation />}
    </div>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <AppRoutes />
          </Router>
        </AuthProvider>
      </ThemeProvider>
      {/* ReactQuery DevTools removed - not needed for production */}
    </QueryClientProvider>
  );
}

export default App;
