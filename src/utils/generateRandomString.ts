import { v4 as uuidv4 } from 'uuid'

const MAX_ORIGINAL_NAME_SUFFIX_LENGTH = 120

const buildSafeStorageSuffix = (name: string) => {
  const safeName = name.replace(/[^a-zA-Z0-9/\-_.]/g, '_')
  const extensionMatch = safeName.match(/(\.[^./]+)$/)
  const extension = extensionMatch?.[1] ?? ''
  const baseName = extension ? safeName.slice(0, -extension.length) : safeName
  const truncatedBase =
    baseName.length > MAX_ORIGINAL_NAME_SUFFIX_LENGTH
      ? baseName.slice(0, MAX_ORIGINAL_NAME_SUFFIX_LENGTH)
      : baseName

  return `${truncatedBase}${extension}`
}

export function generateRandomString(name: string) {
  const result = uuidv4()
  return `${result}_${buildSafeStorageSuffix(name)}`
}
