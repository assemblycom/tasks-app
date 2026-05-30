import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.method === 'HEAD') {
    return new NextResponse(null, { status: 204 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
