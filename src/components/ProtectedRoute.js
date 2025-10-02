import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AUTH_STATES } from '../config/authConfig';

const ProtectedRoute = ({ children }) => {
  const { user, loading, authState } = useAuth();
  const location = useLocation();

  console.log('[ProtectedRoute] Checking auth:', { 
    loading, 
    authState, 
    hasUser: !!user 
  });

  // Only show loading during initial authentication check
  if (loading && authState === AUTH_STATES.INITIALIZING) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-600 border-t-transparent mx-auto"></div>
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Checking authentication...
          </h2>
        </div>
      </div>
    );
  }

  // If not authenticated after loading completes, redirect to login
  if (!user && authState === AUTH_STATES.UNAUTHENTICATED) {
    console.log('[ProtectedRoute] Not authenticated, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is authenticated, render children
  console.log('[ProtectedRoute] User authenticated, rendering protected content');
  return children;
};

export default ProtectedRoute;
