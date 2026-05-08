/**
 * Resource store made accessible by Tasks API
 */
export enum Resource {
  Tasks = 'Task',
  TaskTemplates = 'TaskTemplates',
  WorkflowState = 'WorkflowState',
  ViewSetting = 'ViewSetting',
  WorkspaceSetting = 'WorkspaceSetting',
  Users = 'User',
  Attachments = 'Attachments',
  Comment = 'Comments',
  ScrapMedias = 'ScrapMedias',
  Notifications = 'Notifications',
}

/**
 * NextParam when uuid is being used as a dynamic param (slug) for accessing a resource
 */
export type IdParams = {
  params: Promise<{ id: string }>
}
