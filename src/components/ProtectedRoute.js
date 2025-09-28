// components/ProtectedRoute.js
import React, { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const ProtectedRoute = ({ children }) => {
  const { user, loading, session } = useAuth()
  const location = useLocation()
  const hasCheckedAuth = useRef(false)
  
  useEffect(() => {
    // Mark that we've checked auth for this mount
    hasCheckedAuth.current = true
    
    return () => {
      hasCheckedAuth.current = false
    }
  }, [])

  // Show loading state while checking authentication
  if (loading || !hasCheckedAuth.current) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-600 border-t-transparent mx-auto"></div>
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Loading...
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Verifying authentication status
          </p>
        </div>
      </div>
    )
  }

  // If no user after loading is complete, redirect to login
  if (!user && !session) {
    // Save the attempted location for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // User is authenticated, render children
  return children
}

// Memoized version to prevent unnecessary re-renders
export default React.memo(ProtectedRoute)
