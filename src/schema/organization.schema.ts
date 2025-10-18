import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Organization schema - Root entity of the hierarchy
 * An organization is the top-level container for teams and members
 */
export const organizationSchema = z.object({
  id: z.string().default(generateId),
  name: z.string(),
  slug: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

export type Organization = z.infer<typeof organizationSchema>
