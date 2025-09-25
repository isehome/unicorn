// components/Login.js
import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSearchParams } from 'react-router-dom'

const Login = () => {
  const { login, loading } = useAuth()
  const [error, setError] = useState('')
  const [searchParams] = useSearchParams()

  // Check for error in URL params
  React.useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'auth_failed') {
      setError('Authentication failed. Please try again.')
    } else if (errorParam === 'unexpected_error') {
      setError('An unexpected error occurred. Please try again.')
    }
  }, [searchParams])

  const handleLogin = async () => {
    try {
      setError('')
      await login()
      // The AuthProvider will handle the redirect after successful login
    } catch (error) {
      setError('Failed to sign in with Microsoft. Please try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Intelligent Systems"
              className="w-48 h-auto sm:w-60"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Welcome to Unicorn App
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in with your Microsoft 365 account to continue
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          
          <div>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-violet-500 hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
            >
              {loading ? (
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
            <p className="text-xs text-gray-500">
              By signing in, you agree to use your organization's Microsoft 365 account. 
              Contact your administrator if you need access.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
