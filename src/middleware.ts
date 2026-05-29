import { NextRequest, NextResponse } from 'next/server'

const noStoreHeaders = { 'Cache-Control': 'no-store' }

export function middleware(request: NextRequest) {
  if (request.method === 'HEAD') {
    return new NextResponse(null, { status: 204, headers: noStoreHeaders })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/detail/:task_id/:user_type'],
}
