import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Unified Member schema - Users who belong to a context (organization or team)
 * Uses polymorphic contextType/contextId pattern (same as role, permissionGrant, permissionDeny, invitation)
 * roleId is nullable because roles are not predefined
 */
export const memberSchema = z.object({
  id: z.string().default(generateId),
  contextType: z.enum(['organization', 'team']),
  contextId: z.string(),
  userId: z.string(), // References Better Auth user ID
  roleId: z.string().nullish(), // Nullable - role assignment is optional
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

export type Member = z.infer<typeof memberSchema>
