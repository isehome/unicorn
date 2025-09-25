import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import TechnicianDashboard from './components/TechnicianDashboard';
import PMDashboard from './components/PMDashboard';
import ProjectDetailView from './components/ProjectDetailView';
import PeopleManagement from './components/PeopleManagement';
import WireDropsList from './components/WireDropsList';
import Login from './components/Login';
import ProtectedRoute from './components/ProtectedRoute';
import ThemeToggle from './components/ui/ThemeToggle';
import './index.css';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <TechnicianDashboard />
                </ProtectedRoute>
              } />
              <Route path="/pm-dashboard" element={
                <ProtectedRoute>
                  <PMDashboard />
                </ProtectedRoute>
              } />
              <Route path="/project/:id" element={
                <ProtectedRoute>
                  <ProjectDetailView />
                </ProtectedRoute>
              } />
              <Route path="/people" element={
                <ProtectedRoute>
                  <PeopleManagement />
                </ProtectedRoute>
              } />
              <Route path="/wire-drops" element={
                <ProtectedRoute>
                  <WireDropsList />
                </ProtectedRoute>
              } />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            
            <div className="fixed bottom-20 right-4 z-50">
              <ThemeToggle />
            </div>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
