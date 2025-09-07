import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) return navigate('/login?error=auth_failed')
      if (data?.session) navigate('/')
      else navigate('/login')
    }
    run()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">Authenticating…</div>
  )
}
