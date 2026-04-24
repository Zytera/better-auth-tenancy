/**
 * Better Auth Tenancy - Database Schema
 *
 * This file exports all database schemas for the Better Auth Tenancy plugin.
 * The schemas are organized into logical groups:
 *
 * 1. Hierarchical Entities: organization, team (with unlimited nesting via parentType/parentId)
 * 2. Permission System: statement, statementTranslation
 * 3. Custom Roles: role, roleStatement
 * 4. Memberships: member (unified with contextType/contextId)
 * 5. Explicit Permissions: permissionGrant, permissionDeny
 * 6. Invitations: invitation
 */

// Import all schemas for the allSchemas array
import { organizationSchema } from './organization.schema'
import { teamSchema } from './team.schema'
import { statementSchema, statementTranslationSchema } from './statement.schema'
import {
  roleSchema,
  roleStatementSchema,
} from './role.schema'
import { memberSchema } from './member.schema'
import { permissionGrantSchema, permissionDenySchema } from './permission.schema'
import { invitationSchema } from './invitation.schema'

// Hierarchical Entities
export {
  organizationSchema,
  type Organization,
} from './organization.schema'

export {
  teamSchema,
  teamParentTypes,
  teamParentTypeSchema,
  type Team,
  type TeamParentType,
} from './team.schema'

// Permission System
export {
  statementSchema,
  statementTranslationSchema,
  type Statement,
  type StatementTranslation,
} from './statement.schema'

// Custom Roles
export {
  roleSchema,
  roleStatementSchema,
  type Role,
  type RoleStatement,
} from './role.schema'

// Memberships
export {
  memberSchema,
  type Member,
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

  // Permission System
  statementSchema,
  statementTranslationSchema,

  // Custom Roles
  roleSchema,
  roleStatementSchema,

  // Memberships
  memberSchema,

  // Explicit Permissions
  permissionGrantSchema,
  permissionDenySchema,

  // Invitations
  invitationSchema,
]
