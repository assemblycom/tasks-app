import { NextRequest, NextResponse } from 'next/server'

const DETAIL_PAGE_PATH_PATTERN = /^\/detail\/[^/]+\/[^/]+\/?$/

export function proxy(request: NextRequest): NextResponse | undefined {
  if (request.method !== 'HEAD' || !DETAIL_PAGE_PATH_PATTERN.test(request.nextUrl.pathname)) {
    return undefined
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

export const config = {
  matcher: ['/detail/:path*'],
}
