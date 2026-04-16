import { CommentService } from '@/app/api/comments/comment.service'
import { PublicCommentSerializer } from '@/app/api/comments/public/public.serializer'
import authenticate from '@/app/api/core/utils/authenticate'
import { CommentsPublicFilterType } from '@/types/dto/comment.dto'
import { getPaginationLimit } from '@/utils/pagination'
import { getSearchParams } from '@/utils/request'
import { decode, encode } from 'js-base64'
import { NextRequest, NextResponse } from 'next/server'
import { ValidateUuid } from '@api/core/utils/validateUuid'
import { PublicResource } from '@api/core/types/public'

type TaskAndCommentIdParams = {
  params: Promise<{ id: string }>
}

export const getAllCommentsPublic = async (req: NextRequest) => {
  const user = await authenticate(req)

  const { parentCommentId, createdBy, limit, nextToken, taskId } = getSearchParams(req.nextUrl.searchParams, [
    'parentCommentId',
    'createdBy',
    'limit',
    'nextToken',
    'taskId',
  ])

  const publicFilters: CommentsPublicFilterType = {
    taskId: taskId || undefined,
    parentId: parentCommentId || undefined,
    initiatorId: createdBy || undefined,
  }

  const commentService = new CommentService(user)
  if (taskId) {
    await commentService.checkCommentTaskPermissionForUser(taskId) // check the user accessing the comment has access to the task
  }

  const comments = await commentService.getAllComments({
    limit: getPaginationLimit(limit),
    lastIdCursor: nextToken ? decode(nextToken) : undefined,
    ...publicFilters,
  })

  const lastCommentId = comments[comments.length - 1]?.id
  const hasMoreComments = lastCommentId
    ? await commentService.hasMoreCommentsAfterCursor(lastCommentId, publicFilters)
    : false
  const base64NextToken = hasMoreComments ? encode(lastCommentId) : undefined

  return NextResponse.json({
    data: await PublicCommentSerializer.serializeMany(comments),
    nextToken: base64NextToken,
  })
}

export const getOneCommentPublic = async (req: NextRequest, { params }: TaskAndCommentIdParams) => {
  const { id } = await params
  ValidateUuid(id, PublicResource.Comments)
  const user = await authenticate(req)

  const commentService = new CommentService(user)
  const comment = await commentService.getCommentById({ id, includeAttachments: true })
  if (!comment) return NextResponse.json({ data: null })

  await commentService.checkCommentTaskPermissionForUser(comment.taskId) // check the user accessing the comment has access to the task

  return NextResponse.json({ data: await PublicCommentSerializer.serialize(comment) })
}

export const deleteOneCommentPublic = async (req: NextRequest, { params }: TaskAndCommentIdParams) => {
  const { id } = await params
  ValidateUuid(id, PublicResource.Comments)
  const user = await authenticate(req)

  const commentService = new CommentService(user)

  const deletedComment = await commentService.delete(id)

  await commentService.checkCommentTaskPermissionForUser(deletedComment.taskId) // check the user accessing the comment has access to the task

  return NextResponse.json({ ...(await PublicCommentSerializer.serialize(deletedComment)) })
}
