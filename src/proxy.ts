import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.method !== 'HEAD') {
    return NextResponse.next()
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
    },
  })
}

export const config = {
  matcher: ['/detail/:path*'],
}
