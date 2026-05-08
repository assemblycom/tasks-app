import { CreateTaskRequestSchema, UpdateTaskRequestSchema } from '@/types/dto/tasks.dto'
import { getBooleanQuery, getSearchParams } from '@/utils/request'
import { IdParams } from '@api/core/types/api'
import authenticate from '@api/core/utils/authenticate'
import { TasksService } from '@api/tasks/tasks.service'
import httpStatus from 'http-status'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const getTasks = async (req: NextRequest) => {
  const user = await authenticate(req)

  const { showArchived, showUnarchived, parentId, all } = getSearchParams(req.nextUrl.searchParams, [
    'showArchived',
    'showUnarchived',
    'parentId',
    'all',
    'select',
  ])

  const tasksService = new TasksService(user)
  const tasks = await tasksService.getAllTasks({
    // Show unarchived tasks in response. Default to true
    showUnarchived: getBooleanQuery(showUnarchived, true),

    // Show archive tasks in response. Default to false
    showArchived: getBooleanQuery(showArchived, false),

    // Show subtasks belonging to a particular task only. `null` returns top-level tasks
    parentId: parentId || null,

    // Show all accessible tasks for a user
    all: z.coerce.boolean().parse(all),
  })

  return NextResponse.json({ tasks })
}

export const createTask = async (req: NextRequest) => {
  const user = await authenticate(req)
  const data = CreateTaskRequestSchema.parse(await req.json())
  const disableSubtaskTemplates = req.nextUrl.searchParams.get('disableSubtaskTemplates') === 'true'
  const tasksService = new TasksService(user)
  const newTask = await tasksService.createTask(data, {
    disableSubtaskTemplates,
  })
  return NextResponse.json(newTask, { status: httpStatus.CREATED })
}

export const getTask = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  const user = await authenticate(req)
  const tasksService = new TasksService(user)
  const task = await tasksService.getOneTask(id)
  const assignee = await tasksService.getTaskAssignee(task)
  return NextResponse.json({ task: { ...task, assignee } })
}

export const updateTask = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  const user = await authenticate(req)

  const data = UpdateTaskRequestSchema.parse(await req.json())
  const tasksService = new TasksService(user)
  const updatedTask = await tasksService.updateOneTask(id, data)

  return NextResponse.json({ updatedTask })
}

export const deleteTask = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  const user = await authenticate(req)

  const tasksService = new TasksService(user)
  await tasksService.deleteOneTask(id)
  return new NextResponse(null, { status: httpStatus.NO_CONTENT })
}

export const clientUpdateTask = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  const user = await authenticate(req)
  const workflowStateId = req.nextUrl.searchParams.get('workflowStateId')
  const skipSubtaskCascade = req.nextUrl.searchParams.get('skipSubtaskCascade') === 'true'
  const tasksService = new TasksService(user)
  const updatedTask = await tasksService.clientUpdateTask(id, workflowStateId, skipSubtaskCascade)
  return NextResponse.json({ updatedTask })
}

export const getTaskPath = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  const user = await authenticate(req)
  const tasksService = new TasksService(user)
  const path = await tasksService.getTraversalPath(id)
  return NextResponse.json({ path })
}
