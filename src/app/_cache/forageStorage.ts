'use client'

import { IAssigneeCombined } from '@/types/interfaces'
import localforage from 'localforage'

localforage.config({
  name: 'copilot-tasks-app',
  storeName: 'assignees',
})

export async function getAssignees(lookupKey: string): Promise<IAssigneeCombined[]> {
  if (typeof window === 'undefined') return []

  try {
    if (!(await document.hasStorageAccess())) {
      console.info('Browswer has no storage access')
      await document.requestStorageAccess()
    }

    return (await localforage.getItem<IAssigneeCombined[]>(`assignees.${lookupKey}`)) ?? []
  } catch (error: unknown) {
    console.error(
      "Storage access not granted. Under Chrome's Settings > Privacy and Security, make sure 'Third-party cookies' is allowed.",
    )
    return []
  }
}

export async function setAssignees(lookupKey: string, value: any) {
  if (typeof window === 'undefined') return

  try {
    if (!(await document.hasStorageAccess())) {
      console.info('Browswer has no storage access')
      await document.requestStorageAccess()
    }

    return await localforage.setItem(`assignees.${lookupKey}`, value)
  } catch (error: unknown) {
    console.error(
      "Storage access not granted. Under Chrome's Settings > Privacy and Security, make sure 'Third-party cookies' is allowed.",
    )
  }
}
