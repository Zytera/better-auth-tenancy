/**
 * Better Auth Tenancy - Database Schema
 *
 * This file exports all database schemas for the Better Auth Tenancy plugin.
 * The schemas are organized into logical groups:
 *
 * 1. Hierarchical Entities: organization, team, subteam
 * 2. Permission System: statement, statementTranslation
 * 3. Custom Roles: organizationRole, organizationRoleStatement, teamRole, teamRoleStatement
 * 4. Memberships: organizationMember, teamMember, subteamMember
 * 5. Explicit Permissions: permissionGrant, permissionDeny
 * 6. Invitations: invitation
 */

// Import all schemas for the allSchemas array
import { organizationSchema } from './organization.schema'
import { teamSchema } from './team.schema'
import { subteamSchema } from './subteam.schema'
import { statementSchema, statementTranslationSchema } from './statement.schema'
import {
  organizationRoleSchema,
  organizationRoleStatementSchema,
  teamRoleSchema,
  teamRoleStatementSchema,
} from './role.schema'
import { organizationMemberSchema, teamMemberSchema, subteamMemberSchema } from './member.schema'
import { permissionGrantSchema, permissionDenySchema } from './permission.schema'
import { invitationSchema } from './invitation.schema'

// Hierarchical Entities
export {
  organizationSchema,
  type Organization,
} from './organization.schema'

export {
  teamSchema,
  type Team,
} from './team.schema'

export {
  subteamSchema,
  type Subteam,
} from './subteam.schema'

// Permission System
export {
  statementSchema,
  statementTranslationSchema,
  type Statement,
  type StatementTranslation,
} from './statement.schema'

// Custom Roles
export {
  organizationRoleSchema,
  organizationRoleStatementSchema,
  teamRoleSchema,
  teamRoleStatementSchema,
  type OrganizationRole,
  type OrganizationRoleStatement,
  type TeamRole,
  type TeamRoleStatement,
} from './role.schema'

// Memberships
export {
  organizationMemberSchema,
  teamMemberSchema,
  subteamMemberSchema,
  type OrganizationMember,
  type TeamMember,
  type SubteamMember,
} from './member.schema'

// Explicit Permissions
export {
  permissionGrantSchema,
  permissionDenySchema,
  contextTypes,
  contextTypeSchema,
  type PermissionGrant,
  type PermissionDeny,
  type ContextType,
} from './permission.schema'

// Invitations
export {
  invitationSchema,
  invitationStatuses,
  invitationStatusSchema,
  invitationContextTypes,
  invitationContextTypeSchema,
  type Invitation,
  type InvitationStatus,
  type InvitationContextType,
} from './invitation.schema'

/**
 * All schemas array - useful for migrations and schema management
 */
export const allSchemas = [
  // Hierarchical Entities
  organizationSchema,
  teamSchema,
  subteamSchema,

  // Permission System
  statementSchema,
  statementTranslationSchema,

  // Custom Roles
  organizationRoleSchema,
  organizationRoleStatementSchema,
  teamRoleSchema,
  teamRoleStatementSchema,

  // Memberships
  organizationMemberSchema,
  teamMemberSchema,
  subteamMemberSchema,

  // Explicit Permissions
  permissionGrantSchema,
  permissionDenySchema,

  // Invitations
  invitationSchema,
]
