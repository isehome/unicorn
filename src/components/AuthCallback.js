import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TIMEOUTS } from '../config/authConfig';

export default function AuthCallback() {
  const navigate = useNavigate();
  const processedRef = useRef(false);
  const [status, setStatus] = useState('Processing authentication...');

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    let timeoutId = null;

    const processCallback = async () => {
      console.log('[AuthCallback] Processing OAuth callback');

      timeoutId = setTimeout(() => {
        console.warn('[AuthCallback] Processing timeout');
        setStatus('Taking longer than expected...');
        
        setTimeout(() => {
          navigate('/login?error=callback_timeout', { replace: true });
        }, 2000);
      }, TIMEOUTS.CALLBACK_PROCESS);

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        if (error) {
          console.error('[AuthCallback] OAuth error from provider:', error, errorDescription);
          clearTimeout(timeoutId);
          
          let errorMessage = 'authentication_failed';
          if (error === 'access_denied') {
            errorMessage = 'access_denied';
          } else if (error === 'server_error') {
            errorMessage = 'server_error';
          }
          
          navigate(`/login?error=${errorMessage}`, { replace: true });
          return;
        }

        setStatus('Completing sign in...');

        await new Promise(resolve => setTimeout(resolve, 1000));

        clearTimeout(timeoutId);
        setStatus('Authentication successful!');

        setTimeout(() => {
          navigate('/', { replace: true });
        }, 500);

      } catch (error) {
        console.error('[AuthCallback] Unexpected error:', error);
        clearTimeout(timeoutId);
        setStatus('An error occurred');
        
        setTimeout(() => {
          navigate('/login?error=unexpected_error', { replace: true });
        }, 2000);
      }
    };

    processCallback();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-600 border-t-transparent mx-auto"></div>
        
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          {status}
        </h2>
        
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Please wait while we complete your sign-in
        </p>

        <div className="mt-8 text-xs text-gray-500 dark:text-gray-400 text-left space-y-1">
          <p className="font-medium">If this screen persists:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Ensure pop-ups are allowed for this site</li>
            <li>Try clearing your browser cache</li>
            <li>Check browser console for errors (F12)</li>
            <li>Contact support if the issue continues</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
