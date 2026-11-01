import { shouldDropDestroyedProsemirrorViewSentryEvent } from '@/utils/sentryFilters'

describe('shouldDropDestroyedProsemirrorViewSentryEvent', () => {
  it('drops ProseMirror selection errors after the editor view is torn down', () => {
    expect(
      shouldDropDestroyedProsemirrorViewSentryEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value: "Cannot read properties of null (reading 'node')",
              stacktrace: {
                frames: [{ filename: 'webpack:///_next/static/chunks/prosemirror-view.js', function: 'setSelection' }],
              },
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it('keeps unrelated null reference errors', () => {
    expect(
      shouldDropDestroyedProsemirrorViewSentryEvent({
        exception: {
          values: [
            {
              type: 'TypeError',
              value: "Cannot read properties of null (reading 'node')",
              stacktrace: {
                frames: [{ filename: 'webpack:///_next/static/chunks/app/page.js', function: 'handleClick' }],
              },
            },
          ],
        },
      }),
    ).toBe(false)
  })
})
