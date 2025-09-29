// Debug version of Login component to identify hanging issue
import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const LoginDebug = () => {
  const { login, loading: authLoading, user } = useAuth()
  const [error, setError] = useState('')
  const [debugInfo, setDebugInfo] = useState([])
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  
  const addDebugInfo = (message) => {
    const timestamp = new Date().toLocaleTimeString()
    setDebugInfo(prev => [...prev, `[${timestamp}] ${message}`])
    console.log(`[Login Debug ${timestamp}] ${message}`)
  }

  // Get the redirect location from router state or default to home
  const from = location.state?.from?.pathname || '/'

  // Check for error in URL params
  useEffect(() => {
    const errorParam = searchParams.get('error')
    
    if (errorParam === 'auth_failed') {
      setError('Authentication failed. Please try again.')
      addDebugInfo('Auth failed error from URL')
    } else if (errorParam === 'unexpected_error') {
      setError('An unexpected error occurred. Please try again.')
      addDebugInfo('Unexpected error from URL')
    } else if (errorParam === 'no_auth_code') {
      setError('Authentication was incomplete. Please try signing in again.')
      addDebugInfo('No auth code error from URL')
    } else if (errorParam) {
      setError('An error occurred during authentication. Please try again.')
      addDebugInfo(`Unknown error from URL: ${errorParam}`)
    }
  }, [searchParams])

  // Redirect if already authenticated
  useEffect(() => {
    addDebugInfo(`Auth check - User: ${user ? 'exists' : 'null'}, Loading: ${authLoading}`)
    if (user && !authLoading) {
      addDebugInfo(`Redirecting to ${from}`)
      navigate(from, { replace: true })
    }
  }, [user, authLoading, navigate, from])

  const handleLogin = useCallback(async () => {
    addDebugInfo('Login button clicked')
    
    try {
      setError('')
      addDebugInfo('Clearing errors')
      
      // Clear any existing error params from URL
      if (searchParams.has('error')) {
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('error')
        navigate({ search: newSearchParams.toString() }, { replace: true })
        addDebugInfo('Cleared error params from URL')
      }
      
      addDebugInfo('Checking Supabase client...')
      if (!supabase) {
        throw new Error('Supabase client is not initialized')
      }
      
      addDebugInfo('Calling login function...')
      // This should trigger a browser redirect
      const result = await login()
      
      // This code should NOT execute if OAuth redirect happens
      addDebugInfo('UNEXPECTED: Code after login() executed - no redirect occurred!')
      addDebugInfo(`Login result: ${JSON.stringify(result)}`)
      
    } catch (error) {
      addDebugInfo(`Login error caught: ${error.message}`)
      console.error('Login error:', error)
      
      // Provide more specific error messages based on error type
      if (error.message?.includes('Configuration') || error.message?.includes('not configured')) {
        setError('Authentication is not properly configured. Please contact support.')
        addDebugInfo('Configuration error detected')
      } else if (error.message?.includes('Network')) {
        setError('Network error. Please check your connection and try again.')
        addDebugInfo('Network error detected')
      } else {
        setError(`Failed to sign in: ${error.message}`)
        addDebugInfo('Generic error')
      }
    }
  }, [login, searchParams, navigate])

  const handleClearStorage = () => {
    localStorage.clear()
    sessionStorage.clear()
    addDebugInfo('Cleared all storage')
    window.location.reload()
  }

  const handleCheckSupabase = async () => {
    addDebugInfo('Checking Supabase configuration...')
    
    if (!supabase) {
      addDebugInfo('ERROR: Supabase client is null!')
      return
    }
    
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        addDebugInfo(`Session check error: ${error.message}`)
      } else {
        addDebugInfo(`Session exists: ${data?.session ? 'Yes' : 'No'}`)
        if (data?.session) {
          addDebugInfo(`User email: ${data.session.user?.email || 'unknown'}`)
        }
      }
    } catch (e) {
      addDebugInfo(`Exception checking session: ${e.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Debug Login Component
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Auth Loading: {String(authLoading)} | User: {user ? 'Yes' : 'No'}
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          
          <div className="space-y-3">
            <button
              onClick={handleLogin}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
            >
              Test Microsoft Sign In
            </button>
            
            <button
              onClick={handleCheckSupabase}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
            >
              Check Supabase Status
            </button>
            
            <button
              onClick={handleClearStorage}
              className="w-full flex justify-center py-2 px-4 border border-red-300 text-sm font-medium rounded-lg text-red-700 bg-white hover:bg-red-50"
            >
              Clear Storage & Reload
            </button>
          </div>
          
          {/* Debug info */}
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Debug Log:</h3>
            <div className="bg-gray-100 dark:bg-gray-800 rounded p-3 text-xs font-mono space-y-1 max-h-60 overflow-y-auto">
              {debugInfo.length === 0 ? (
                <div className="text-gray-500">No debug info yet...</div>
              ) : (
                debugInfo.map((info, index) => (
                  <div key={index} className="text-gray-700 dark:text-gray-300">
                    {info}
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Environment info */}
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <div>Supabase URL: {process.env.REACT_APP_SUPABASE_URL ? 'Set' : 'Not set'}</div>
            <div>Supabase Key: {process.env.REACT_APP_SUPABASE_ANON_KEY ? 'Set' : 'Not set'}</div>
            <div>Current Path: {location.pathname}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginDebug
