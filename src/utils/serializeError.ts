// JS can throw anything; this turns the unknown into something safe to log.
export const serializeError = (err: unknown) => (err instanceof Error ? { message: err.message, stack: err.stack } : err)
