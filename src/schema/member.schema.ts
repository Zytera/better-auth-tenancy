import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Organization Member schema - Users who belong to an organization
 * roleId is nullable because roles are not predefined
 */
export const organizationMemberSchema = z.object({
  id: z.string().default(generateId),
  organizationId: z.string(),
  userId: z.string(), // References Better Auth user ID
  roleId: z.string().nullish(), // Nullable - role assignment is optional
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

/**
 * Team Member schema - Users who belong to a team
 * roleId references team roles (can be from the team's custom roles)
 */
export const teamMemberSchema = z.object({
  id: z.string().default(generateId),
  teamId: z.string(),
  userId: z.string(), // References Better Auth user ID
  roleId: z.string().nullish(), // Nullable - role assignment is optional
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

/**
 * Subteam Member schema - Users who belong to a subteam
 *
 * roleId references teamRole from the parent team - this allows:
 * - Reusing team roles across subteams (avoids duplication)
 * - Simpler role management
 * - Clear inheritance model
 *
 * Note: roleId is nullable because members can exist without a role assignment
 */
export const subteamMemberSchema = z.object({
  id: z.string().default(generateId),
  subteamId: z.string(),
  userId: z.string(), // References Better Auth user ID
  roleId: z.string().nullish(), // Uses parent team roles - nullable
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

export type OrganizationMember = z.infer<typeof organizationMemberSchema>
export type TeamMember = z.infer<typeof teamMemberSchema>
export type SubteamMember = z.infer<typeof subteamMemberSchema>
