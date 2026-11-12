/**
 * Better Auth Tenancy - Server Module
 *
 * Main export file for server-side functionality
 */

// Export main plugin and utilities
export { tenancy, isTenancyPlugin } from './plugin.js'

// Export configuration types
export type { TenancyConfig } from './plugin.js'

// Export endpoint functions
export { organizationEndpoints } from './organizations.js'
export { teamEndpoints, deleteTeamRecursive } from './teams.js'
export { statementEndpoints } from './statements.js'
export { roleEndpoints } from './roles.js'
export { memberEndpoints } from './members.js'
export { invitationEndpoints } from './invitations.js'
export { permissionEndpoints, resolvePermission, requirePermission } from './permissions.js'
export type { ResolvePermissionResult } from './permissions.js'

// Export middleware utilities
export { requireSession, getOptionalSession, applyEndpointAuth, requireEndpointAuth, requireSelfOr } from './middleware.js'

// Export input types
export type { CreateOrganizationInput, UpdateOrganizationInput } from './organizations.js'
export type { CreateTeamInput, UpdateTeamInput } from './teams.js'
export type { CreateStatementInput } from './statements.js'
export type { CreateRoleInput, UpdateRoleInput } from './roles.js'
export type { AddMemberInput, UpdateMemberRoleInput, Member } from './members.js'
export type { CreateInvitationInput } from './invitations.js'
export type { GrantPermissionInput, DenyPermissionInput, RevokePermissionInput, CheckPermissionInput } from './permissions.js'

// Export config types
export type {
  EndpointConfig,
  EndpointAuthHook,
  EndpointAuthContext,
  ResourceContext,
  HierarchyLimits,
  I18nConfig,
  InvitationConfig,
  PermissionFilteringHooks,
} from '../types/config.js'

// Export hook types
export type { CacheHooks, AuditHooks } from '../types/index.js'

// Export context types
export type { ContextType, Context } from '../types/index.js'
