/**
 * Better Auth Tenancy - Server Module
 *
 * Main export file for server-side functionality
 */

// Export main plugin and utilities
export { tenancy, isTenancyPlugin } from './plugin'

// Export configuration types
export type { TenancyConfig } from './plugin'

// Export endpoint functions
export { organizationEndpoints } from './organizations'
export { teamEndpoints, deleteTeamRecursive } from './teams'
export { statementEndpoints } from './statements'
export { roleEndpoints } from './roles'
export { memberEndpoints } from './members'
export { invitationEndpoints } from './invitations'
export { permissionEndpoints, resolvePermission, requirePermission } from './permissions'
export type { ResolvePermissionResult } from './permissions'

// Export middleware utilities
export { requireSession, applyEndpointAuth } from './middleware'

// Export input types
export type { CreateOrganizationInput, UpdateOrganizationInput } from './organizations'
export type { CreateTeamInput, UpdateTeamInput } from './teams'
export type { CreateStatementInput } from './statements'
export type { CreateRoleInput, UpdateRoleInput } from './roles'
export type { AddMemberInput, UpdateMemberRoleInput, Member } from './members'
export type { CreateInvitationInput } from './invitations'
export type { GrantPermissionInput, DenyPermissionInput, RevokePermissionInput, CheckPermissionInput } from './permissions'

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
} from '../types/config'

// Export hook types
export type { CacheHooks, AuditHooks } from '../types'

// Export context types
export type { ContextType, Context } from '../types'
