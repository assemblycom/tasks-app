import { toNavigateHref, toReportedLocation } from './location'

describe('toReportedLocation', () => {
  it('keeps internal paths as-is', () => {
    expect(toReportedLocation('/detail/abc/iu', '')).toEqual({ path: '/detail/abc/iu', search: '' })
    expect(toReportedLocation('/configure-tasks-app', '')).toEqual({ path: '/configure-tasks-app', search: '' })
  })

  it('reports client task details under the /client surface prefix', () => {
    expect(toReportedLocation('/detail/abc/cu', '').path).toBe('/client/detail/abc/cu')
    expect(toReportedLocation('/client/detail/abc/cu', '').path).toBe('/client/detail/abc/cu')
    expect(toReportedLocation('/client', '').path).toBe('/client')
  })

  it('never reports the token or host-owned and one-shot params', () => {
    const search = 'token=secret&clientId=c1&companyId=co1&isRedirect=1&fromNotificationCenter=1&action=x&pf=y'
    expect(toReportedLocation('/', search).search).toBe('')
  })

  it('keeps commentId so a link lands on the comment', () => {
    expect(toReportedLocation('/detail/abc/iu', 'token=secret&commentId=c9').search).toBe('?commentId=c9')
  })
})

describe('toNavigateHref', () => {
  it('re-attaches the current token', () => {
    expect(toNavigateHref('/detail/abc/iu', '?commentId=c9', 'tok')).toBe('/detail/abc/iu?commentId=c9&token=tok')
    expect(toNavigateHref('/client', '', 'tok')).toBe('/client?token=tok')
  })

  it('returns the bare path when there is nothing to add', () => {
    expect(toNavigateHref('/', '', null)).toBe('/')
  })
})
