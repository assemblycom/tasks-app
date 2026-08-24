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
    return (await localforage.getItem<IAssigneeCombined[]>(`assignees.${lookupKey}`)) ?? []
  } catch (error: unknown) {
    console.info('Assignee cache unavailable, falling back to network', error)
    return []
  }
}

export async function setAssignees(lookupKey: string, value: IAssigneeCombined[]) {
  if (typeof window === 'undefined') return

  try {
    return await localforage.setItem(`assignees.${lookupKey}`, value)
  } catch (error: unknown) {
    console.info('Assignee cache write skipped, storage unavailable', error)
  }
}
