import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  // 1. Block common automated bot vulnerability scans and path traversal probes immediately
  const rawPath = request.nextUrl.pathname.toLowerCase()
  if (
    rawPath.includes('/.env') ||
    rawPath.includes('/.git') ||
    rawPath.includes('/wp-') ||
    rawPath.includes('/xmlrpc') ||
    rawPath.includes('/phpmyadmin') ||
    rawPath.includes('/admin.php') ||
    rawPath.includes('/.aws') ||
    rawPath.includes('/.ssh') ||
    rawPath.includes('..')
  ) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const withRefreshedCookiesAndSecurity = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    // Enforce essential security headers
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(self), geolocation=(), payment=(), usb=()'
    )
    if (process.env.NODE_ENV === 'production') {
      response.headers.set(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload'
      )
    }
    return response
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup' ||
    request.nextUrl.pathname === '/forgot-password'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return withRefreshedCookiesAndSecurity(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated
  const protectedPaths = [
    '/dashboard',
    '/inbox',
    '/contacts',
    '/pipelines',
    '/broadcasts',
    '/automations',
    '/flows',
    '/agents',
    '/billing',
    '/gmb',
    '/profile',
    '/settings',
    '/super-admin',
  ]
  if (!user && protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookiesAndSecurity(NextResponse.redirect(url))
  }

  // Super-admin API routes - block unauthenticated access immediately
  if (!user && request.nextUrl.pathname.startsWith('/api/super-admin/')) {
    return withRefreshedCookiesAndSecurity(
      NextResponse.json({ error: 'Unauthorized: Super admin access required' }, { status: 401 })
    )
  }

  // API routes that need auth (not webhooks or OAuth redirect callbacks)
  if (
    !user &&
    request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
    !request.nextUrl.pathname.includes('/webhook') &&
    !request.nextUrl.pathname.includes('/embedded-signup/callback')
  ) {
    return withRefreshedCookiesAndSecurity(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return withRefreshedCookiesAndSecurity(supabaseResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
