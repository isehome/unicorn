// components/Login.js
import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'

const Login = () => {
  const { login, loading: authLoading, user } = useAuth()
  const [error, setError] = useState('')
  const [localLoading, setLocalLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  
  // Get the redirect location from router state or default to home
  const from = location.state?.from?.pathname || '/'

  // Check for error in URL params
  useEffect(() => {
    const errorParam = searchParams.get('error')
    
    if (errorParam === 'auth_failed') {
      setError('Authentication failed. Please try again.')
    } else if (errorParam === 'unexpected_error') {
      setError('An unexpected error occurred. Please try again.')
    } else if (errorParam === 'no_auth_code') {
      setError('Authentication was incomplete. Please try signing in again.')
    } else if (errorParam) {
      setError('An error occurred during authentication. Please try again.')
    }
  }, [searchParams])

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !authLoading) {
      navigate(from, { replace: true })
    }
  }, [user, authLoading, navigate, from])

  const handleLogin = useCallback(async () => {
    try {
      setError('')
      setLocalLoading(true)
      
      // Clear any existing error params from URL
      if (searchParams.has('error')) {
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('error')
        navigate({ search: newSearchParams.toString() }, { replace: true })
      }
      
      // Start the OAuth flow - this will redirect the browser
      await login()
      
      // Note: The browser will redirect to Microsoft, so the code below 
      // won't execute. The loading state is reset when component unmounts
      // or when user returns from failed auth
      
    } catch (error) {
      console.error('Login error:', error)
      
      // Only set loading to false if we catch an error
      // (means the redirect didn't happen)
      setLocalLoading(false)
      
      // Provide more specific error messages based on error type
      if (error.message?.includes('Configuration')) {
        setError('Authentication is not properly configured. Please contact support.')
      } else if (error.message?.includes('Network')) {
        setError('Network error. Please check your connection and try again.')
      } else {
        setError('Failed to sign in with Microsoft. Please try again.')
      }
    }
    // Removed finally block - it won't execute after redirect
  }, [login, searchParams, navigate])

  const isLoading = authLoading || localLoading

  // Reset loading state when component mounts (e.g., after returning from failed auth)
  useEffect(() => {
    // If we have an error param, reset loading state
    if (searchParams.has('error')) {
      setLocalLoading(false)
    }
    
    // Cleanup function to reset loading when component unmounts
    return () => {
      setLocalLoading(false)
    }
  }, [searchParams])

  // If we're still checking auth status, show a loading screen
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-600 border-t-transparent mx-auto"></div>
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Checking authentication...
          </h2>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Intelligent Systems"
              className="w-48 h-auto sm:w-60"
              onError={(e) => { 
                e.currentTarget.style.display = 'none'
                // Optionally show a text fallback
                const textFallback = document.getElementById('logo-fallback')
                if (textFallback) textFallback.style.display = 'block'
              }}
            />
            <h1 
              id="logo-fallback" 
              className="text-3xl font-bold text-violet-600 dark:text-violet-400" 
              style={{ display: 'none' }}
            >
              Unicorn
            </h1>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
            Welcome to Unicorn App
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Sign in with your Microsoft 365 account to continue
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg relative" role="alert">
              <span className="block sm:inline">{error}</span>
              <button
                onClick={() => setError('')}
                className="absolute top-0 right-0 px-4 py-3 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                aria-label="Dismiss"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
          
          <div>
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out transform hover:scale-[1.02]"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </div>
              ) : (
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 23 23" fill="currentColor">
                    <path d="M11.1 0H0v11.1h11.1V0z" fill="#f25022"/>
                    <path d="M23 0H11.9v11.1H23V0z" fill="#00a4ef"/>
                    <path d="M11.1 11.9H0V23h11.1V11.9z" fill="#ffb900"/>
                    <path d="M23 11.9H11.9V23H23V11.9z" fill="#7fba00"/>
                  </svg>
                  Continue with Microsoft 365
                </div>
              )}
            </button>
          </div>
          
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              By signing in, you agree to use your organization's Microsoft 365 account. 
              Contact your administrator if you need access.
            </p>
          </div>
          
          {/* Troubleshooting help */}
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
            <details className="text-sm text-gray-600 dark:text-gray-400">
              <summary className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 font-medium">
                Having trouble signing in?
              </summary>
              <ul className="mt-3 space-y-2 ml-4 list-disc">
                <li>Make sure you're using your work or school Microsoft account</li>
                <li>Check that your account has been granted access to this application</li>
                <li>Try clearing your browser cache and cookies</li>
                <li>If issues persist, contact your IT administrator</li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
