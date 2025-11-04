import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Team schema - First level of grouping within an organization
 * A team belongs to one organization and can contain subteams or members directly
 */
export const teamSchema = z.object({
  id: z.string().default(generateId),
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

export type Team = z.infer<typeof teamSchema>
