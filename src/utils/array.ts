/**
 * Gets the difference between two arrays
 */
export const getArrayDifference = <T>(arr1: T[], arr2: T[]): T[] => {
  return arr1.filter((item) => !arr2.includes(item))
}

/**
 * Gets the intersection between two arrays
 */
export const getArrayIntersection = <T>(arr1: T[], arr2: T[]): T[] => {
  const set2 = new Set(arr2)
  return arr1.filter((item) => set2.has(item))
}

type Grouped<T> = {
  [key: string]: T[]
}

/**
 * Group an array of object by object key
 */
export const groupBy = <T, K extends keyof T>(arr: T[], key: K): Grouped<T> => {
  return arr.reduce((acc, obj) => {
    const groupKey = String(obj[key]) // Ensure key is string for object keys
    acc[groupKey] = acc[groupKey] || []
    acc[groupKey].push(obj)
    return acc
  }, {} as Grouped<T>)
}

export const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

/**
 * Runs `handler` over `items` with bounded concurrency: at most `size` run at once,
 * one batch after another. Prevents unbounded fan-out from exhausting the DB connection
 * pool (and downstream rate limits) when the input can be large.
 */
export const runInBatches = async <T, R>(
  items: T[],
  size: number,
  handler: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const indexed = items.map((item, index) => ({ item, index }))
  const results: R[] = []
  for (const batch of chunk(indexed, size)) {
    results.push(...(await Promise.all(batch.map(({ item, index }) => handler(item, index)))))
  }
  return results
}
