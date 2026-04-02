'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Suspense } from 'react';

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const supabase = createClient();

  const searchParams = useSearchParams();

  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError) setError(decodeURIComponent(urlError));
  }, [searchParams]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
         style={{ background: 'linear-gradient(135deg, #fdfbf7 0%, #f4ecda 50%, #fdfbf7 100%)' }}>

      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, #c9a84c 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10"
             style={{ background: 'radial-gradient(circle, #1a1612 0%, transparent 70%)' }} />
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1612" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative w-full max-w-sm mx-4 animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 shadow-medium"
               style={{ background: 'linear-gradient(135deg, #1a1612 0%, #322b22 100%)' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="6" width="24" height="18" rx="2" stroke="#c9a84c" strokeWidth="1.5"/>
              <path d="M8 11h16M8 15h10M8 19h8" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="23" cy="21" r="4" fill="#c9a84c"/>
              <path d="M21 21l1.5 1.5L25 19" stroke="#1a1612" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="font-display text-4xl text-ink-900 font-medium tracking-tight">Certify</h1>
          <p className="text-ink-500 text-sm mt-2 font-sans">Professional certificate generation</p>
        </div>

        {/* Card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-strong border border-ink-100/60">
          <h2 className="font-display text-xl text-ink-800 mb-1">Welcome back</h2>
          <p className="text-ink-500 text-sm mb-7">Sign in to access your certificate workspace</p>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button onClick={handleGoogleLogin} disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl
                             bg-white border-2 border-ink-200 hover:border-ink-300 hover:bg-parchment-50
                             text-ink-800 text-sm font-medium transition-all duration-200
                             disabled:opacity-60 disabled:cursor-not-allowed shadow-soft hover:shadow-medium">
            {loading ? (
              <svg className="animate-spin w-5 h-5 text-ink-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>

          <p className="text-center text-xs text-ink-400 mt-6">
            Access is restricted to authorized team members only
          </p>
        </div>

        <p className="text-center text-xs text-ink-400 mt-6">
          © {new Date().getFullYear()} Certify · Built for small teams
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}