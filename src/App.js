import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import TechnicianDashboard from './components/TechnicianDashboard';
import PMDashboard from './components/PMDashboard';
import ProjectDetailView from './components/ProjectDetailView';
import PeopleManagement from './components/PeopleManagement';
import WireDropsList from './components/WireDropsList';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AppHeader from './components/AppHeader';
import SettingsPage from './components/SettingsPage';
import BottomNavigation from './components/BottomNavigation';
import AuthCallback from './components/AuthCallback';
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
                <ProjectDetailView />
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
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
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
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
