import { RootState } from '@/redux/store'
import { DateString } from '@/types/date'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { Associations } from '@/types/dto/tasks.dto'
import { CreateTaskErrors, UserIds } from '@/types/interfaces'
import { UserIdsType } from '@/utils/assignee'
import { createSlice } from '@reduxjs/toolkit'

interface IErrors {
  [CreateTaskErrors.TITLE]: boolean
}

interface IInitialState {
  showModal: boolean
  activeWorkflowStateId: string | null
  title: string
  description: string
  workflowStateId: string
  dueDate: DateString | null
  errors: IErrors
  appliedTitle: string | null
  appliedDescription: string | null
  templateId: string | null
  userIds: UserIdsType
  associations: Associations
  isShared: boolean
  parentId: string | null
  disableSubtaskTemplates: boolean
}

type CreateTaskFieldPayloadType = { targetField: keyof IInitialState; value: IInitialState[keyof IInitialState] }

const initialState: IInitialState = {
  showModal: false,
  activeWorkflowStateId: null,
  title: '',
  workflowStateId: '',
  description: '',
  dueDate: null,
  errors: {
    [CreateTaskErrors.TITLE]: false,
  },
  appliedTitle: null,
  appliedDescription: null,
  templateId: null,
  userIds: {
    [UserIds.INTERNAL_USER_ID]: null,
    [UserIds.CLIENT_ID]: null,
    [UserIds.COMPANY_ID]: null,
  },
  associations: [],
  isShared: false,
  parentId: null,
  disableSubtaskTemplates: false,
}

type CreateTaskFieldType = Pick<
  IInitialState,
  'title' | 'description' | 'workflowStateId' | 'dueDate' | 'templateId' | 'userIds' | 'parentId'
>

const createTaskSlice = createSlice({
  name: 'createTask',
  initialState,
  reducers: {
    setShowModal: (state) => {
      state.showModal = !state.showModal
    },

    // Sets the default workflowStateId to be selected when opening task create modal
    setActiveWorkflowStateId: (state, action: { payload: string | null }) => {
      state.activeWorkflowStateId = action.payload
    },

    setCreateTaskFields: (state, action: { payload: CreateTaskFieldPayloadType }) => {
      const { targetField, value } = action.payload
      //@ts-ignore
      state[targetField] = value
    },

    setMultipleCreateTaskFields: (state, action: { payload: CreateTaskFieldPayloadType[] }) => {
      action.payload.forEach(({ targetField, value }) => {
        // @ts-ignore
        state[targetField] = value
      })
    },

    // sets all the fields of the create task form
    setAllCreateTaskFields: (state, action: { payload: CreateTaskFieldType }) => {
      state.title = action.payload.title
      state.description = action.payload.description
      state.workflowStateId = action.payload.workflowStateId
      state.dueDate = action.payload.dueDate
      state.templateId = action.payload.templateId
      state.userIds = action.payload.userIds
      state.parentId = action.payload.parentId
    },

    clearCreateTaskFields: (state, action: { payload: { isFilterOn: boolean } }) => {
      const { isFilterOn } = action.payload
      state.title = ''
      state.workflowStateId = ''
      state.description = ''
      state.templateId = null
      if (!isFilterOn) {
        state.userIds = {
          [UserIds.INTERNAL_USER_ID]: null,
          [UserIds.CLIENT_ID]: null,
          [UserIds.COMPANY_ID]: null,
        }
      }
      state.associations = []
      state.isShared = false
      state.dueDate = null
      state.errors = {
        [CreateTaskErrors.TITLE]: false,
      }
      state.appliedDescription = null
      state.appliedTitle = null
      state.disableSubtaskTemplates = false
    },

    setErrors: (state, action: { payload: { key: CreateTaskErrors; value: boolean } }) => {
      const { key, value } = action.payload
      state.errors[key] = value
    },

    setAppliedTitle: (state, action: { payload: { title: string | null } }) => {
      const { title } = action.payload
      state.appliedTitle = title
    },
    setAppliedDescription: (state, action: { payload: { description: string | null } }) => {
      const { description } = action.payload
      state.appliedDescription = description
    },
  },
})

export const selectCreateTask = (state: RootState) => state.createTask

export const {
  setShowModal,
  setActiveWorkflowStateId,
  setCreateTaskFields,
  setMultipleCreateTaskFields,
  clearCreateTaskFields,
  setErrors,
  setAppliedDescription,
  setAppliedTitle,
  setAllCreateTaskFields,
} = createTaskSlice.actions

export default createTaskSlice.reducer
