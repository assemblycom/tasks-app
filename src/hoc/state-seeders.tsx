'use client'

import { selectTaskBoard, setActiveTask, setTasks } from '@/redux/features/taskBoardSlice'
import { selectCreateTemplate, setActiveTemplate } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { ITemplate } from '@/types/interfaces'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'

export const SeedActiveTask = ({ task }: { task?: TaskResponse }) => {
  const { activeTask } = useSelector(selectTaskBoard)

  // Reconcile drift on every render — rescues a stale unmount-clear from a
  // previous SeedActiveTask losing the race against this mount's dispatch
  // under React 18 concurrent rendering.
  useEffect(() => {
    if (task) {
      if (!activeTask || activeTask.id !== task.id) {
        const tasksInStore = store.getState().taskBoard.tasks
        const updated = tasksInStore.map((t) => (t.id === task.id ? task : t))
        store.dispatch(setTasks(updated))
        store.dispatch(setActiveTask(task))
      }
    } else if (activeTask !== undefined) {
      store.dispatch(setActiveTask(undefined))
    }
  }, [task, activeTask])

  // Empty deps so the clear fires only on true unmount, not on every reconcile.
  useEffect(() => {
    return () => {
      store.dispatch(setActiveTask(undefined))
    }
  }, [])

  return null
}

export const SeedActiveTemplate = ({ template }: { template?: ITemplate }) => {
  const { activeTemplate } = useSelector(selectCreateTemplate)

  // Same shape as SeedActiveTask: reconcile-on-render heals drift if a stale
  // cleanup from a previous mount lands after this one's dispatch.
  useEffect(() => {
    if (template) {
      if (!activeTemplate || activeTemplate.id !== template.id) {
        store.dispatch(setActiveTemplate(template))
      }
    } else if (activeTemplate !== null) {
      store.dispatch(setActiveTemplate(null))
    }
  }, [template, activeTemplate])

  // Empty deps so the clear fires only on true unmount.
  useEffect(() => {
    return () => {
      store.dispatch(setActiveTemplate(null))
    }
  }, [])

  return null
}
