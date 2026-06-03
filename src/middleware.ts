import { NextRequest, NextResponse } from 'next/server'

const DEPLOYMENT_PIN_COOKIE = '__vdpl'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID

  if (process.env.VERCEL_SKEW_PROTECTION_ENABLED === '1' && deploymentId && !request.cookies.has(DEPLOYMENT_PIN_COOKIE)) {
    response.cookies.set(DEPLOYMENT_PIN_COOKIE, deploymentId, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
