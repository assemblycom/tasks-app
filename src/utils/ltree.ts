export const buildLtree = (...paths: string[]) => {
  return paths.map(buildLtreeNodeString).join('.')
}

export const buildLtreeNodeString = (str: string) => {
  return str.toLowerCase().replaceAll('-', '_')
}

export const getIdsFromLtreePath = (path: string): string[] =>
  (path || '')
    .replaceAll('_', '-')
    .split('.')
    .filter((id) => !!id)
