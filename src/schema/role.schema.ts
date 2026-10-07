import * as z from 'zod'
import { generateId } from 'better-auth'

export const roleSchema = z.object({
  id: z.string().default(generateId),
  contextType: z.enum(['organization', 'team']),
  contextId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

export const roleStatementSchema = z.object({
  id: z.string().default(generateId),
  roleId: z.string(),
  statementId: z.string(),
  createdAt: z.date().default(() => new Date()),
})

export const roleTranslationSchema = z.object({
  id: z.string().default(generateId),
  roleId: z.string(),
  locale: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  createdAt: z.date().default(() => new Date()),
})

export type Role = z.infer<typeof roleSchema>
export type RoleStatement = z.infer<typeof roleStatementSchema>
export type RoleTranslation = z.infer<typeof roleTranslationSchema>
