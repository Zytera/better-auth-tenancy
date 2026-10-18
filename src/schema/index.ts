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
import { organizationSchema } from './organization.schema.js'
import { teamSchema } from './team.schema.js'
import { statementSchema, statementTranslationSchema } from './statement.schema.js'
import {
  roleSchema,
  roleStatementSchema,
  roleTranslationSchema,
} from './role.schema.js'
import { memberSchema } from './member.schema.js'
import { permissionGrantSchema, permissionDenySchema } from './permission.schema.js'
import { invitationSchema } from './invitation.schema.js'

// Hierarchical Entities
export {
  organizationSchema,
  type Organization,
} from './organization.schema.js'

export {
  teamSchema,
  teamParentTypes,
  teamParentTypeSchema,
  type Team,
  type TeamParentType,
} from './team.schema.js'

// Permission System
export {
  statementSchema,
  statementTranslationSchema,
  type Statement,
  type StatementTranslation,
} from './statement.schema.js'

// Custom Roles
export {
  roleSchema,
  roleStatementSchema,
  roleTranslationSchema,
  type Role,
  type RoleStatement,
  type RoleTranslation,
} from './role.schema.js'

// Memberships
export {
  memberSchema,
  type Member,
} from './member.schema.js'

// Explicit Permissions
export {
  permissionGrantSchema,
  permissionDenySchema,
  contextTypes,
  contextTypeSchema,
  type PermissionGrant,
  type PermissionDeny,
  type ContextType,
} from './permission.schema.js'

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
} from './invitation.schema.js'

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
  roleTranslationSchema,

  // Memberships
  memberSchema,

  // Explicit Permissions
  permissionGrantSchema,
  permissionDenySchema,

  // Invitations
  invitationSchema,
]
