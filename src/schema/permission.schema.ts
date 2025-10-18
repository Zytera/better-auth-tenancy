import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Context Type - Defines the hierarchy level where a permission applies
 */
export const contextTypes = ['organization', 'team', 'subteam'] as const
export const contextTypeSchema = z.enum(contextTypes)
export type ContextType = z.infer<typeof contextTypeSchema>

/**
 * Permission Grant schema - Explicit permission grants to users
 * Highest precedence after denies in the permission evaluation logic
 * Supports temporary permissions via expiresAt field
 */
export const permissionGrantSchema = z.object({
  id: z.string().default(generateId),
  userId: z.string(), // References Better Auth user ID
  statementId: z.string(),
  contextType: contextTypeSchema,
  contextId: z.string(), // References organization, team, or subteam ID
  expiresAt: z.date().nullish(), // Nullable - if null, grant never expires
  grantedBy: z.string(), // User ID who granted this permission
  createdAt: z.date().default(() => new Date()),
})

/**
 * Permission Deny schema - Explicit permission denials
 * Highest precedence in the permission evaluation logic (overrides everything)
 * No expiration - denies are permanent until explicitly removed
 */
export const permissionDenySchema = z.object({
  id: z.string().default(generateId),
  userId: z.string(), // References Better Auth user ID
  statementId: z.string(),
  contextType: contextTypeSchema,
  contextId: z.string(), // References organization, team, or subteam ID
  deniedBy: z.string(), // User ID who denied this permission
  createdAt: z.date().default(() => new Date()),
})

export type PermissionGrant = z.infer<typeof permissionGrantSchema>
export type PermissionDeny = z.infer<typeof permissionDenySchema>
