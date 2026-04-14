// Icons defined for app bridge
export enum Icons {
  ARCHIVE = 'Archive',
  PLUS = 'Plus',
  TEMPLATES = 'Templates',
  TRASH = 'Trash',
  CHECK = 'Check',
}

export interface Clickable {
  label: string
  onClick?: () => void
  icon?: Icons
  color?: string
}
