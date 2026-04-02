import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code       = requestUrl.searchParams.get('code');
  const error      = requestUrl.searchParams.get('error');
  const errorDesc  = requestUrl.searchParams.get('error_description');
  const origin     = requestUrl.origin;

  console.log('\n[DEBUG auth/callback] All cookies from browser:', request.cookies.getAll());

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(errorDesc ?? error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent('No auth code received.')}`
    );
  }

  try {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('[auth/callback]', exchangeError.message);
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  } catch (err) {
    console.error('[auth/callback] unexpected:', err);
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent('Unexpected error. Please try again.')}`
    );
  }
}