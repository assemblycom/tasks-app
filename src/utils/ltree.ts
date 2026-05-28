export const buildLtree = (...paths: string[]) => {
  return paths.map(buildLtreeNodeString).join('.')
}

export const buildLtreeNodeString = (str: string) => {
  return str.toLowerCase().replaceAll('-', '_')
}

export const getIdsFromLtreePath = (path: string | null | undefined): string[] =>
  path ? path.replaceAll('_', '-').split('.') : []
