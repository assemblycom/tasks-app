import { NextRequest, NextResponse } from 'next/server'

const DETAIL_PAGE_PATH_PATTERN = /^\/detail\/[^/]+\/[^/]+\/?$/

export const isDetailPageHeadRequest = (request: Pick<NextRequest, 'method' | 'nextUrl'>) =>
  request.method === 'HEAD' && DETAIL_PAGE_PATH_PATTERN.test(request.nextUrl.pathname)

export function middleware(request: NextRequest) {
  if (isDetailPageHeadRequest(request)) {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/detail/:task_id/:user_type'],
}
