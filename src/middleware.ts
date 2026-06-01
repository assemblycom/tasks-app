import { NextRequest, NextResponse } from 'next/server'

const DETAIL_PAGE_PATH_PATTERN = /^\/detail\/[0-9a-fA-F-]{36}\/(?:iu|cu)$/

export const shouldShortCircuitDetailHeadRequest = (method: string, pathname: string) =>
  method === 'HEAD' && DETAIL_PAGE_PATH_PATTERN.test(pathname)

export function middleware(request: NextRequest) {
  if (!shouldShortCircuitDetailHeadRequest(request.method, request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  // HEAD probes should confirm the route exists without triggering the full SSR data load.
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Length': '0',
    },
  })
}

export const config = {
  matcher: ['/detail/:task_id/:user_type'],
}
