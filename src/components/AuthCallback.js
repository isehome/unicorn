import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const run = async () => {
      try {
        // First check if a session already exists
        const { data: existing, error: getErr } = await supabase.auth.getSession()
        if (getErr) throw getErr
        if (existing?.session) {
          navigate('/')
          return
        }

        // If no session yet, explicitly exchange the code for a session
        const url = window.location.href
        const hasCode = /[?&#](code|access_token)=/.test(url)
        if (hasCode) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(url)
          if (error) throw error
          if (data?.session) {
            navigate('/')
            return
          }
        }

        // Fallback
        navigate('/login?error=auth_failed')
      } catch (e) {
        console.error('Auth callback failed', e)
        navigate('/login?error=auth_failed')
      }
    }
    run()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">Authenticating…</div>
  )
}
