import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Subteam schema - Second level of grouping within a team
 * A subteam belongs to one team and contains members directly
 */
export const subteamSchema = z.object({
  id: z.string().default(generateId),
  teamId: z.string(),
  name: z.string(),
  slug: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

export type Subteam = z.infer<typeof subteamSchema>
