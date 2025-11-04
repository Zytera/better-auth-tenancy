import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Organization Role schema - Custom roles defined at organization level
 * No predefined roles - all roles are created dynamically by users
 */
export const organizationRoleSchema = z.object({
  id: z.string().default(generateId),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

/**
 * Organization Role Statement schema - Many-to-many relationship
 * Links roles to their permissions (statements)
 */
export const organizationRoleStatementSchema = z.object({
  roleId: z.string(),
  statementId: z.string(),
  createdAt: z.date().default(() => new Date()),
})

/**
 * Team Role schema - Custom roles defined at team level
 * Each team can define its own roles independent of other teams
 * Subteams use roles from their parent team
 */
export const teamRoleSchema = z.object({
  id: z.string().default(generateId),
  teamId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
})

/**
 * Team Role Statement schema - Many-to-many relationship
 * Links team roles to their permissions (statements)
 */
export const teamRoleStatementSchema = z.object({
  roleId: z.string(),
  statementId: z.string(),
  createdAt: z.date().default(() => new Date()),
})

export type OrganizationRole = z.infer<typeof organizationRoleSchema>
export type OrganizationRoleStatement = z.infer<typeof organizationRoleStatementSchema>
export type TeamRole = z.infer<typeof teamRoleSchema>
export type TeamRoleStatement = z.infer<typeof teamRoleStatementSchema>
