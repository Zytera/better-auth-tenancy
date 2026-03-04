import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Team parent types - a team can belong to an organization or another team
 * This enables unlimited nesting depth
 */
export const teamParentTypes = ['organization', 'team'] as const
export const teamParentTypeSchema = z.enum(teamParentTypes)
export type TeamParentType = z.infer<typeof teamParentTypeSchema>

/**
 * Team schema - Unified hierarchical grouping within an organization
 * Uses parentType/parentId for unlimited nesting (organization → team → team → ...)
 */
export const teamSchema = z.object({
  id: z.string().default(generateId),
  parentType: teamParentTypeSchema,
  parentId: z.string(),
  name: z.string(),
  slug: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

export type Team = z.infer<typeof teamSchema>
