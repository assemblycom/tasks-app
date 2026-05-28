import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.method === 'HEAD') {
    // Detail page renders perform several database reads; HEAD callers only need headers.
    return new NextResponse(null, { status: 200 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/detail/:path*',
}
