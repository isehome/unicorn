import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const ranRef = useRef(false)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const processAuth = async () => {
      try {
        // First check if a session already exists
        const { data: existing, error: getErr } = await supabase.auth.getSession()
        
        if (getErr) {
          console.warn('Error getting existing session', getErr)
        }
        
        if (existing?.session) {
          navigate('/')
          return
        }

        // If no session yet, check for auth code/token in URL
        const url = window.location.href
        const hasCode = /[?&#](code|access_token)=/.test(url)
        
        if (!hasCode) {
          // No code in URL, maybe we're already authenticated
          // Wait a bit for auth state to settle
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const { data: checkAgain } = await supabase.auth.getSession()
          if (checkAgain?.session) {
            navigate('/')
            return
          }
          
          // Still no session, redirect to login
          navigate('/login?error=no_auth_code')
          return
        }

        // Exchange the code for a session with retry logic
        let attempts = 0
        let lastError = null
        
        while (attempts < maxRetries) {
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(url)
            
            if (error) {
              lastError = error
              attempts++
              
              // Special handling for specific error types
              if (error.message?.includes('expired') || error.message?.includes('invalid')) {
                // Code is expired or invalid, no point retrying
                break
              }
              
              if (attempts < maxRetries) {
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
                continue
              }
            }
            
            if (data?.session) {
              // Success! Navigate to home
              navigate('/')
              return
            }
            
            // No error but also no session, break out
            break
          } catch (err) {
            lastError = err
            attempts++
            
            if (attempts < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
            }
          }
        }

        // All retries exhausted
        console.error('Auth callback failed after retries', lastError)
        
        // Try one more time to get session (maybe it was set by another tab)
        await new Promise(resolve => setTimeout(resolve, 1000))
        const { data: finalCheck } = await supabase.auth.getSession()
        if (finalCheck?.session) {
          navigate('/')
          return
        }
        
        // Navigate to login with error
        navigate('/login?error=auth_failed')
      } catch (e) {
        console.error('Unexpected error in auth callback', e)
        navigate('/login?error=unexpected_error')
      }
    }

    processAuth()
  }, [navigate, retryCount, maxRetries])

  // Retry handler for manual retry
  const handleRetry = () => {
    ranRef.current = false
    setRetryCount(prev => prev + 1)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-600 border-t-transparent mx-auto"></div>
        <h2 className="text-lg font-medium text-gray-900">
          Authenticating...
        </h2>
        <p className="text-sm text-gray-600">
          Please wait while we complete your sign-in
        </p>
        {retryCount > 0 && (
          <div className="mt-4">
            <p className="text-sm text-amber-600 mb-2">
              Authentication is taking longer than expected...
            </p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-colors text-sm font-medium"
            >
              Retry Authentication
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
