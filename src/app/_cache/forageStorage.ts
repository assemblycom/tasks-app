'use client'

import { IAssigneeCombined } from '@/types/interfaces'
import localforage from 'localforage'

localforage.config({
  name: 'copilot-tasks-app',
  storeName: 'assignees',
})

async function hasAssigneeStorageAccess() {
  if (typeof window === 'undefined') return false

  if (typeof document.hasStorageAccess !== 'function') {
    return true
  }

  try {
    const hasAccess = await document.hasStorageAccess()
    if (!hasAccess) {
      console.info('Browser has no storage access')
    }
    // requestStorageAccess() requires a user gesture in embedded contexts, so cache
    // helpers should fall back to network data instead of prompting during mount.
    return hasAccess
  } catch {
    return false
  }
}

export async function migrateAssignees(lookupKey: string) {
  if (!(await hasAssigneeStorageAccess())) return

  const lKey = `assignees.${lookupKey}`

  try {
    const existing = localStorage.getItem(lKey)

    if (existing) {
      const parsed = JSON.parse(existing)
      await localforage.setItem(lKey, parsed)
      localStorage.removeItem(lKey)
    }
  } catch (err) {
    console.error('Migration failed', err)
  }
} //a utility function to migrate existing assignee data from localStorage to localForage

export async function getAssignees(lookupKey: string): Promise<IAssigneeCombined[]> {
  if (!(await hasAssigneeStorageAccess())) return []

  try {
    return (await localforage.getItem<IAssigneeCombined[]>(`assignees.${lookupKey}`)) ?? []
  } catch (error: unknown) {
    console.error(
      "Storage access not granted. Under Chrome's Settings > Privacy and Security, make sure 'Third-party cookies' is allowed.",
    )
    return []
  }
}

export async function setAssignees(lookupKey: string, value: any) {
  if (!(await hasAssigneeStorageAccess())) return

  try {
    return await localforage.setItem(`assignees.${lookupKey}`, value)
  } catch (error: unknown) {
    console.error(
      "Storage access not granted. Under Chrome's Settings > Privacy and Security, make sure 'Third-party cookies' is allowed.",
    )
  }
}
