// components/AuthCallback.js
import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const AuthCallback = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Handle the OAuth callback
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Auth callback error:', error)
          navigate('/login?error=auth_failed')
          return
        }

        if (data.session) {
          // User is authenticated, redirect to dashboard
          navigate('/dashboard')
        } else {
          // No session, redirect to login
          navigate('/login')
        }
      } catch (error) {
        console.error('Unexpected error during auth callback:', error)
        navigate('/login?error=unexpected_error')
      }
    }

    handleAuthCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
        <h2 className="mt-4 text-lg font-medium text-gray-900">
          Completing authentication...
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Please wait while we verify your credentials.
        </p>
      </div>
    </div>
  )
}

export default AuthCallback