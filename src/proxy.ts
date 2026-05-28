import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.method === 'HEAD') {
    return new NextResponse(null, { status: 200 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/detail/:task_id/:user_type',
}
