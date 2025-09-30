import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import TechnicianDashboardOptimized from './components/TechnicianDashboardOptimized';
import PMDashboard from './components/PMDashboard';
import ProjectDetailView from './components/ProjectDetailView';
import PMProjectView from './components/PMProjectView';
import IssueDetail from './components/IssueDetail';
import PeopleManagement from './components/PeopleManagement';
import WireDropsList from './components/WireDropsList';
import WireDropNew from './components/WireDropNew';
import WireDropDetailEnhanced from './components/WireDropDetailEnhanced';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AppHeader from './components/AppHeader';
import SettingsPage from './components/SettingsPage';
import BottomNavigation from './components/BottomNavigation';
import AuthCallback from './components/AuthCallback';
import IssuesListPageOptimized from './components/IssuesListPageOptimized';
import TodosListPage from './components/TodosListPage';
import './index.css';

const AppRoutes = () => {
  const location = useLocation();
  const hideChrome = ['/login', '/auth/callback'].includes(location.pathname);
  const { loading } = useAuth();

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
                <PMProjectView />
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
                <WireDropsList />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!hideChrome && <BottomNavigation />}

      {loading && (
        <div className="fixed inset-0 z-[60] bg-white/70 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span>Signing you in…</span>
          </div>
        </div>
      )}
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
