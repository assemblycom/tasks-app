// Icons defined for app bridge
export enum Icons {
  ARCHIVE = 'Archive',
  PLUS = 'Plus',
  TEMPLATES = 'Templates',
  TRASH = 'Trash',
  CHECK = 'Check',
}

export interface BreadcrumbsPayload {
  items: {
    label: string
    onClick: string
  }[]
  type: 'header.breadcrumbs'
}

export interface PrimaryCtaPayload {
  icon?: Icons
  label: string
  onClick?: string
  type: 'header.primaryCta'
}

export interface SecondaryCtaPayload {
  icon?: Icons
  label: string
  onClick?: string
  type: 'header.secondaryCta'
}

export interface ActionsMenuPayload {
  items: {
    label: string
    onClick: string
    icon?: Icons
    color?: string
  }[]
  type: 'header.actionsMenu'
}

export interface Clickable {
  label: string
  onClick?: () => void
  icon?: Icons
  color?: string
}

export interface Configurable {
  portalUrl?: string
}

export interface LocationChangedPayload {
  type: 'location.changed'
  path: string
  search: string
  replace?: boolean
}

export interface LocationNavigateMessage {
  type: 'location.navigate'
  path: string
  search: string
  replace?: boolean
}
