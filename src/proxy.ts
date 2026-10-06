import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(req: NextRequest) {
  if (process.env.DESKTOP_RUNTIME === '1') {
    const isLoopback = req.nextUrl.hostname === '127.0.0.1' || req.nextUrl.hostname === 'localhost'
    const expected = process.env.DESKTOP_AUTH_TOKEN

    if (!isLoopback || !expected) {
      return new NextResponse('Desktop Auth required', { status: 401 })
    }

    const desktopToken = req.headers.get('x-desktop-token') || ''
    const expectedBuf = Buffer.from(expected)
    const tokenBuf = Buffer.from(desktopToken)

    if (expectedBuf.length === tokenBuf.length && crypto.timingSafeEqual(expectedBuf, tokenBuf)) {
      return NextResponse.next()
    }

    return new NextResponse('Desktop Auth required', { status: 401 })
  }
  const isLoopback = req.nextUrl.hostname === '127.0.0.1' || req.nextUrl.hostname === 'localhost'
  if (process.env.NODE_ENV === 'development' && isLoopback) {
    return NextResponse.next()
  }

  return new NextResponse('本アプリケーションはデスクトップ（Electron）専用です。', {
    status: 401,
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
