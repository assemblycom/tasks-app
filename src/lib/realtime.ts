'use client'

import { RealTimeTaskResponse } from '@/hoc/RealTime'
import { selectTaskBoard, setAccessibleTasks, setActiveTask, setTasks } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { InternalUsersSchema, Token } from '@/types/common'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { IAssigneeCombined } from '@/types/interfaces'
import { getFormattedTask } from '@/utils/getFormattedRealTimeData'
import { getPreviewMode } from '@/utils/previewMode'
import { extractImgSrcs, replaceImgSrcs } from '@/utils/signedUrlReplacer'
import { AssigneeType } from '@prisma/client'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { z } from 'zod'

export class RealtimeHandler {
  constructor(
    private readonly payload: RealtimePostgresChangesPayload<RealTimeTaskResponse>,
    private readonly user: IAssigneeCombined,
    private readonly userRole: AssigneeType,
    private readonly redirectToBoard: (newTask: RealTimeTaskResponse) => void,
    private readonly tokenPayload: Token,
  ) {
    const newTask = getFormattedTask(this.payload.new)
    if (newTask.workspaceId !== tokenPayload.workspaceId) {
      console.error('Realtime event ignored for task with different workspaceId')
      return
    }
  }

  /**
   * Check if the task is associated with the user or shared with the user
   * If CRM view include association and shared. If CU view include only shared
   */
  private isAssociatedOrShared(newTask: RealTimeTaskResponse): boolean {
    const isPreviewMode = !!getPreviewMode(this.tokenPayload)
    const isClientUser = this.tokenPayload.clientId && !isPreviewMode

    if (isClientUser || isPreviewMode) {
      const isRelatedTo = !!newTask.associations?.some(
        (association) =>
          (association.clientId === this.tokenPayload.clientId && association.companyId === this.tokenPayload.companyId) ||
          (!association.clientId && association.companyId === this.tokenPayload.companyId),
      )
      return isClientUser ? isRelatedTo && !!newTask.isShared : isRelatedTo
    }

    return false
  } //check if the task incoming from realtime includes the logged in client as a viewer.

  /**
   * Filters out tasks this user type does not have access to
   */
  private isSubtaskAccessible(newTask: RealTimeTaskResponse): boolean {
    const currentState = store.getState()
    const { assignee } = selectTaskBoard(currentState)
    // Ignore all tasks that belong to client / company in user's limited access array, if IU is ClientAccessLimited
    if (this.userRole === AssigneeType.internalUser) {
      const iu = InternalUsersSchema.parse(this.user)
      if (iu.isClientAccessLimited) {
        const companyAccessList = iu.companyAccessList || []
        if (newTask.assigneeType === AssigneeType.client) {
          const client = assignee.find((user) => user.id === newTask.assigneeId)
          if (!client) return false
          if (!companyAccessList.includes(z.string().parse(client.companyId))) {
            return false
          }
        } else if (newTask.assigneeType === AssigneeType.company) {
          if (!companyAccessList.includes(newTask.assigneeId)) {
            return false
          }
        }
      }
    } else if (this.userRole === AssigneeType.client) {
      // Ignore all tasks that don't belong to client

      if (
        !this.isAssociatedOrShared(newTask) &&
        !(
          (newTask.clientId == this.tokenPayload.clientId && newTask.companyId == this.tokenPayload.companyId) ||
          (newTask.clientId == null && newTask.companyId == this.tokenPayload.companyId)
        )
      ) {
        return false
      }
    } else {
      console.error("Couldn't validate realtime task access because userRole is not defined")
      return false
    }
    return true
  }

  /**
   * Handler for subtask insert, for subtasks that are accessible to the current user
   */
  private handleRealtimeSubtaskInsert(newTask: RealTimeTaskResponse) {
    const currentState = store.getState()
    const { tasks, accessibleTasks } = selectTaskBoard(currentState)

    // Check if this new task is a disjoint task by checking if accessible tasks array contains its parent.
    // If it is a disjoint task we need to insert it to the board
    const isParentTaskAccessible = accessibleTasks.some((task) => task.id === newTask.parentId)

    if (this.userRole === AssigneeType.internalUser) {
      const user = InternalUsersSchema.parse(this.user)
      if (user.isClientAccessLimited && !isParentTaskAccessible) {
        store.dispatch(setTasks([...tasks, newTask]))
      }
    }
    if (this.userRole === AssigneeType.client && !isParentTaskAccessible) {
      store.dispatch(setTasks([...tasks, newTask]))
    }
    // Append this new task to set of accessible tasks
    store.dispatch(setAccessibleTasks([...accessibleTasks, newTask]))
  }

  /**
   * Handler for subtask update, for subtasks that are accessible to the current user
   */
  private handleRealtimeSubtaskUpdate(newTask: RealTimeTaskResponse) {
    const currentState = store.getState()
    const { tasks, accessibleTasks, activeTask } = selectTaskBoard(currentState)

    const isTaskVisibleInBoard = tasks.some((task) => task.id === newTask.id)
    const filterOutNewTask = <T extends { id: string }>(tasks: T[]): T[] => {
      return tasks.filter((task) => task.id !== newTask.id)
    }

    // Remove from tasks and accessibleTasks array, if task has been deleted.
    if (newTask.deletedAt) {
      if (isTaskVisibleInBoard) {
        store.dispatch(setTasks(filterOutNewTask(tasks)))
      }
      store.dispatch(setAccessibleTasks(filterOutNewTask(accessibleTasks)))
      // If there are disjoint child tasks floating around in the task board - support multiple levels of nesting for the future
      if (tasks.some((task) => task.parentId === newTask.id)) {
        store.dispatch(setTasks(tasks.filter((task) => task.parentId !== newTask.id)))
      }
      if (newTask.id === activeTask?.id) {
        return this.redirectToBoard(newTask)
      }
      return //if sub task is deleted and is not an active task, no need to redirectToBoard but prevent further data manipulation on deleted subtask.
    }

    const isParentTaskAccessible = accessibleTasks.some((task) => task.id === newTask.parentId)
    if (this.isSubtaskAccessible(newTask)) {
      // If task is accessible, add it to the tasks array
      if (!isTaskVisibleInBoard && !isParentTaskAccessible) {
        store.dispatch(setTasks([...tasks, newTask]))
      }
    }

    // It's possible that a subtask exists in `tasks` because it can be a disjoint task, update it
    if (isTaskVisibleInBoard) {
      store.dispatch(
        setTasks(
          tasks.map((task) => {
            return task.id === newTask.id
              ? // Update task - account for TOAST behavior in `body`, and format realtime postgres' timestamp
                { ...newTask, body: newTask.body || task.body }
              : task
          }),
        ),
      )
    }

    if (activeTask && activeTask.id === newTask.id) {
      store.dispatch(setActiveTask(newTask))
    } //updating active task if a user is currently in details page of the task being udpated
    // Update it in accessible tasks
    const updatedAccessibleTasks = [
      ...accessibleTasks.filter((t) => t.id !== newTask.id),
      {
        ...newTask,
        body: newTask.body || accessibleTasks.find((t) => t.id === newTask.id)?.body,
      },
    ]
    store.dispatch(setAccessibleTasks(updatedAccessibleTasks))
  }

  /**
   * Handler for realtime subtasks
   */
  handleRealtimeSubtasks() {
    const currentState = store.getState()
    const { tasks, accessibleTasks } = selectTaskBoard(currentState)

    const newTask = getFormattedTask(this.payload.new)

    // Being a subtask, this surely has a valid non-null parentId
    newTask.parentId = z.string().parse(newTask.parentId)

    // If subtask is no longer accessible, yeet it out from tasks & accessibleTasks arrays
    if (!this.isSubtaskAccessible(newTask)) {
      store.dispatch(setAccessibleTasks(accessibleTasks.filter((task) => task.id !== newTask.id)))
      if (tasks.some((task) => task.id === newTask.id)) {
        store.dispatch(setTasks(tasks.filter((task) => task.id !== newTask.id)))
      }
      return this.redirectToBoard(newTask)
    }

    if (this.payload.eventType === 'INSERT') {
      return this.handleRealtimeSubtaskInsert(newTask)
    }
    if (this.payload.eventType === 'UPDATE') {
      return setTimeout(() => {
        this.handleRealtimeSubtaskUpdate(newTask)
      }, 0) //avoid race condition causing duplicate data when update is triggered before create.
    }
    console.error('Unknown event type for realtime subtask handler')
  }

  /**
   * Handler for realtime task inserts
   */
  handleRealtimeTaskInsert() {
    const newTask = getFormattedTask(this.payload.new)

    const commonStore = store.getState()
    const { accessibleTasks, showUnarchived, tasks } = commonStore.taskBoard

    // Step 1: Guardrail returns
    // --- Internal User
    if (this.userRole === AssigneeType.internalUser) {
      const iu = InternalUsersSchema.parse(this.user)
      // If the user has limited client access, and this task is outside of it, return
      if (iu.isClientAccessLimited && newTask.companyId && !iu.companyAccessList!.includes(newTask.companyId)) {
        return
      }
    }
    // --- Client

    if (this.userRole === AssigneeType.client) {
      // Return if:
      // - task is unassigned
      // - task is an IU task
      // - task is a client task, assigned to another client
      // - task's companyId does not match current user's active companyId
      if (
        !this.isAssociatedOrShared(newTask) &&
        (!newTask.assigneeId ||
          !!newTask.internalUserId ||
          (newTask.clientId && newTask.clientId !== this.tokenPayload.clientId) ||
          this.tokenPayload.companyId !== newTask.companyId)
      ) {
        return
      }
    }

    // Step 2: Add to accessible + board tasks
    store.dispatch(setAccessibleTasks([...accessibleTasks, newTask]))
    if (showUnarchived) {
      store.dispatch(
        setTasks([
          // Remove any previously disjointed tasks from the board
          ...tasks.filter((task) => task.parentId !== newTask.id),
          newTask,
        ]),
      )
    }
  }

  /**
   * Handler for realtime task update events
   */
  handleRealtimeTaskUpdate() {
    const updatedTask = getFormattedTask(this.payload.new)
    const prevTask = getFormattedTask(this.payload.old)

    const commonStore = store.getState()
    const { activeTask, accessibleTasks, showArchived, showUnarchived, tasks } = commonStore.taskBoard

    const filterOutUpdatedTask = <T extends { id: string }>(tasks: T[]): T[] =>
      tasks.filter((task) => task.id !== updatedTask.id)

    // CASE I: Task is deleted
    if (updatedTask.deletedAt) {
      setTimeout(() => {
        store.dispatch(setTasks(filterOutUpdatedTask(tasks)))
        store.dispatch(setAccessibleTasks(filterOutUpdatedTask(accessibleTasks)))
      }, 0) //simple patch for race condition when update event fires before create event

      //if a user is in the details page when the task is deleted then we want the user to get redirected to '/' route
      if (updatedTask.id === activeTask?.id) {
        return this.redirectToBoard(updatedTask)
      }
    }

    // CASE II: REASSIGNMENT OUT OF SCOPE
    // --- Handle unassignment for clients (board + details page)
    const isReassignedOutOfClientScope =
      this.userRole === AssigneeType.client &&
      !this.isAssociatedOrShared(updatedTask) &&
      (!updatedTask.clientId
        ? updatedTask.companyId !== this.tokenPayload.companyId
        : updatedTask.companyId !== this.tokenPayload.companyId || updatedTask.clientId !== this.tokenPayload.clientId)

    const isReassignedOutOfLimitedIUScope = (() => {
      if (this.userRole !== AssigneeType.internalUser) return false
      const iu = InternalUsersSchema.parse(this.user)
      if (updatedTask.internalUserId || !updatedTask.assigneeId) {
        return false
      }
      return iu.isClientAccessLimited && !iu.companyAccessList?.includes(updatedTask.companyId || '__')
    })()

    if (isReassignedOutOfClientScope || isReassignedOutOfLimitedIUScope) {
      // Get the previous task from tasks array and check if it was previously assigned to this client
      const task = tasks.find((task) => task.id === updatedTask.id)
      if (!task) {
        return
      }

      const newTaskArr = filterOutUpdatedTask(tasks)
      // Check if any disjoint children were created
      const newlyDisjointChildren = accessibleTasks.filter((task) => task.parentId === updatedTask.id)
      newlyDisjointChildren.length && newTaskArr.push(...newlyDisjointChildren)

      store.dispatch(setTasks(newTaskArr))
      store.dispatch(setAccessibleTasks(filterOutUpdatedTask(accessibleTasks)))
      if (updatedTask.id === activeTask?.id) {
        return this.redirectToBoard(updatedTask)
      }
      return
    }

    // CASE III: Reassignment into scope
    const isReassignedIntoClientScope =
      this.userRole === AssigneeType.client &&
      (updatedTask.assigneeId !== prevTask.assigneeId ||
        this.isAssociatedOrShared(updatedTask) ||
        (!updatedTask.clientId
          ? updatedTask.companyId === this.tokenPayload.companyId
          : updatedTask.companyId === this.tokenPayload.companyId && updatedTask.clientId === this.tokenPayload.clientId))

    const isReassignedIntoLimitedIUScope = (() => {
      if (this.userRole !== AssigneeType.internalUser) return false
      if (updatedTask.internalUserId || !updatedTask.assigneeId) {
        return true
      }
      const iu = InternalUsersSchema.parse(this.user)
      return iu.isClientAccessLimited && iu.companyAccessList?.includes(updatedTask.companyId || '__')
    })()

    if (isReassignedIntoClientScope || isReassignedIntoLimitedIUScope) {
      store.dispatch(
        setTasks([...tasks.filter((task) => task.id !== updatedTask.id && task.parentId !== updatedTask.id), updatedTask]), //also removing previous stand alone tasks after the reassignment.
      )
      store.dispatch(
        setAccessibleTasks([
          ...accessibleTasks.filter((accessibleTask) => accessibleTask.id !== updatedTask.id),
          updatedTask,
        ]),
      )
      if (activeTask && activeTask.id === updatedTask.id) {
        store.dispatch(setActiveTask(updatedTask))
      }
      return
    }

    // CASE IV: Task properties except deletedAt / assigneeId (userId) are updated

    // Get from active task directly (user is in task board)
    const oldTask = tasks.find((t) => t.id == updatedTask.id)
    this.processTaskDescription(updatedTask, oldTask)

    // Handle task updated to an archival state not active in user's viewsettings filter
    if ((updatedTask.isArchived && !showArchived) || (!updatedTask.isArchived && !showUnarchived)) {
      if (activeTask && activeTask.id === updatedTask.id) {
        // However if we're in the details page of this task, we want the changes to reflect
        store.dispatch(setActiveTask(updatedTask))
      }
      store.dispatch(setTasks(filterOutUpdatedTask(tasks)))
      return
    }

    // Update active task if it's the one being updated
    if (activeTask && activeTask.id === updatedTask.id) {
      store.dispatch(setActiveTask(updatedTask))
    }

    // Update tasks + accessibleTasks
    if (tasks.some((task) => task.id === updatedTask.id)) {
      store.dispatch(setTasks(tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task))))
    }
    store.dispatch(setAccessibleTasks(accessibleTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task))))
  }

  private processTaskDescription(updatedTask: TaskResponse, oldTask?: TaskResponse) {
    // Address Postgres' TOAST limitation that causes fields like TEXT, BYTEA to be copied as a pointer, instead of copying template field in realtime replica
    // (See TOAST https://www.postgresql.org/docs/current/storage-toast.html)
    // If `body` field (which *can* be toasted) is not changed, Supabase Realtime won't send large fields like this in `payload.new`
    // So, we need to check if the oldTask has valid body but new body field is not being sent in updatedTask, and add it if required
    if (oldTask?.body && updatedTask.body === undefined) {
      updatedTask.body = oldTask?.body
    }

    // Extract new image Srcs and replace it with old ones, because since we are creating a new url of images on each task details navigation,
    // a second user navigating the task details will generate a new src and replace it in the database which causes the previous user to load the src again(because its new)
    if (oldTask && oldTask.body && updatedTask.body) {
      const oldImgSrcs = extractImgSrcs(oldTask.body)
      const newImgSrcs = extractImgSrcs(updatedTask.body)
      if (oldImgSrcs.length > 0 && newImgSrcs.length > 0) {
        updatedTask.body = replaceImgSrcs(updatedTask.body, newImgSrcs, oldImgSrcs)
      }
    }
  }
}
