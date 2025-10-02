import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const ranRef = useRef(false)
  const [retryCount, setRetryCount] = useState(0)
  const [debugInfo, setDebugInfo] = useState('')
  const maxRetries = 3

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const processAuth = async () => {
      try {
        console.log('[AuthCallback] Starting auth processing...')
        setDebugInfo('Checking for existing session...')
        
        // First check if a session already exists
        const { data: existing, error: getErr } = await supabase.auth.getSession()
        
        if (getErr) {
          console.warn('[AuthCallback] Error getting existing session', getErr)
        }
        
        if (existing?.session) {
          console.log('[AuthCallback] Existing session found, redirecting to home')
          navigate('/', { replace: true })
          return
        }

        // Check URL for auth parameters
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const queryParams = new URLSearchParams(window.location.search)
        
        // Check for access_token in hash (implicit flow)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        
        if (accessToken && refreshToken) {
          console.log('[AuthCallback] Found tokens in hash, setting session')
          setDebugInfo('Found tokens, setting session...')
          
          // Set the session manually
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
          
          if (error) {
            console.error('[AuthCallback] Error setting session from tokens:', error)
            navigate('/login?error=auth_failed')
            return
          }
          
          if (data?.session) {
            console.log('[AuthCallback] Session set from tokens, redirecting')
            navigate('/', { replace: true })
            return
          }
        }
        
        // Check for authorization code (PKCE flow)
        const code = queryParams.get('code')
        
        if (!code && !accessToken) {
          console.log('[AuthCallback] No auth code or token in URL')
          setDebugInfo('No authentication data found in URL')
          
          // Wait a bit for auth state to settle
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const { data: checkAgain } = await supabase.auth.getSession()
          if (checkAgain?.session) {
            console.log('[AuthCallback] Session found after delay')
            navigate('/', { replace: true })
            return
          }
          
          // Still no session, redirect to login
          navigate('/login?error=no_auth_code')
          return
        }

        if (code) {
          console.log('[AuthCallback] Found auth code, attempting exchange...')
          setDebugInfo('Exchanging authorization code...')
          
          // Exchange the code for a session with retry logic
          let attempts = 0
          let lastError = null
          
          while (attempts < maxRetries) {
            try {
              console.log(`[AuthCallback] Exchange attempt ${attempts + 1}/${maxRetries}`)
              
              // exchangeCodeForSession doesn't take parameters in newer Supabase versions
              // It automatically reads the code from the current URL
              const { data, error } = await supabase.auth.exchangeCodeForSession()
              
              if (error) {
                lastError = error
                console.error(`[AuthCallback] Exchange error on attempt ${attempts + 1}:`, error)
                attempts++
                
                // Special handling for specific error types
                if (error.message?.includes('expired') || error.message?.includes('invalid') || error.message?.includes('already been used')) {
                  // Code is expired, invalid, or already used - no point retrying
                  console.log('[AuthCallback] Code is invalid/expired/used, stopping retries')
                  break
                }
                
                if (attempts < maxRetries) {
                  // Wait before retrying (exponential backoff)
                  const delay = Math.pow(2, attempts) * 1000
                  console.log(`[AuthCallback] Waiting ${delay}ms before retry...`)
                  await new Promise(resolve => setTimeout(resolve, delay))
                  continue
                }
              }
              
              if (data?.session) {
                // Success! Navigate to home
                console.log('[AuthCallback] Exchange successful, redirecting to home')
                navigate('/', { replace: true })
                return
              }
              
              // No error but also no session, break out
              console.log('[AuthCallback] No error but no session returned')
              break
            } catch (err) {
              lastError = err
              console.error(`[AuthCallback] Unexpected error on attempt ${attempts + 1}:`, err)
              attempts++
              
              if (attempts < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
              }
            }
          }

          // All retries exhausted
          console.error('[AuthCallback] Auth callback failed after retries', lastError)
          setDebugInfo('Authentication failed after retries')
        }
        
        // Try one more time to get session (maybe it was set by another tab)
        await new Promise(resolve => setTimeout(resolve, 1000))
        const { data: finalCheck } = await supabase.auth.getSession()
        if (finalCheck?.session) {
          console.log('[AuthCallback] Final check found session')
          navigate('/', { replace: true })
          return
        }
        
        // Navigate to login with error
        console.log('[AuthCallback] No session after all attempts, redirecting to login')
        navigate('/login?error=auth_failed')
      } catch (e) {
        console.error('[AuthCallback] Unexpected error in auth callback', e)
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
          {debugInfo || 'Please wait while we complete your sign-in'}
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
        <div className="mt-8 text-xs text-gray-500">
          <p>If this screen persists, please:</p>
          <ol className="text-left mt-2 space-y-1">
            <li>1. Open browser console (F12)</li>
            <li>2. Check for error messages</li>
            <li>3. Clear browser cache and cookies</li>
            <li>4. Try signing in again</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
