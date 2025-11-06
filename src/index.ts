/**
 * @zytera/better-auth-tenancy
 *
 * Multi-tenant organizations with hierarchical RBAC for Better Auth.
 *
 * Features:
 * - Hierarchical organizations (Organization → Team → Subteam)
 * - Hybrid RBAC (Role-based + statement-level permissions)
 * - Explicit grants and denies (deny always wins)
 * - Custom roles per organization/team
 * - Statement inheritance with "most specific wins" rule
 * - Temporary permissions with expiration
 * - Multi-language support with i18n
 * - Invitation system with hooks
 * - Customizable limits
 * - Cache hooks for performance
 * - Audit hooks for compliance
 *
 * @example Server-side usage:
 * ```typescript
 * import { betterAuth } from 'better-auth'
 * import { tenancy } from '@zytera/better-auth-tenancy/server'
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     tenancy({
 *       limits: {
 *         maxTeamsPerOrganization: 100,
 *       },
 *       cache: {
 *         async get(key) { return redis.get(key) },
 *         async set(key, value, ttl) { return redis.set(key, value, 'EX', ttl) },
 *         async invalidate(pattern) { return redis.del(pattern) },
 *       },
 *       audit: {
 *         async onPermissionGranted(event) {
 *           console.log('Permission granted:', event)
 *         },
 *       }
 *     })
 *   ]
 * })
 * ```
 *
 * @example Client-side usage (Web):
 * ```typescript
 * import { createAuthClient } from 'better-auth/clients'
 * import { tenancyClient } from '@zytera/better-auth-tenancy/clients/web'
 *
 * const client = createAuthClient({
 *   baseURL: '/api/auth',
 *   plugins: [tenancyClient({ locale: 'es' })]
 * })
 * ```
 *
 * @example Client-side usage (React Native/Expo):
 * ```typescript
 * import { createAuthClient } from 'better-auth/react'
 * import { expoClient } from '@better-auth/expo/clients'
 * import { tenancyClient } from '@zytera/better-auth-tenancy/clients/native'
 *
 * const client = createAuthClient({
 *   baseURL: 'https://api.example.com/api/auth',
 *   plugins: [
 *     expoClient(),
 *     tenancyClient({ locale: 'es' })
 *   ]
 * })
 * ```
 *
 * @packageDocumentation
 */

// NOTE: For the server plugin (tenancy function), import from '@zytera/better-auth-tenancy/server'
// This main export only provides shared types, schemas, and utilities

// Schema exports (database schemas and types)
export {
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
  contextTypes,
  contextTypeSchema,
  // Invitations
  invitationSchema,
  invitationStatuses,
  invitationStatusSchema,
  invitationContextTypes,
  invitationContextTypeSchema,
  // All schemas array
  allSchemas,
} from './schema'

export type {
  // Hierarchical Entities
  Organization,
  Team,
  Subteam,
  // Permission System
  Statement,
  StatementTranslation,
  // Custom Roles
  OrganizationRole,
  OrganizationRoleStatement,
  TeamRole,
  TeamRoleStatement,
  // Memberships
  OrganizationMember,
  TeamMember,
  SubteamMember,
  // Explicit Permissions
  PermissionGrant,
  PermissionDeny,
  // Invitations
  Invitation,
} from './schema'

// Type exports (prefer types from ./types over schema enums)
export type {
  // Configuration
  TenancyConfig,
  EndpointConfig,
  HierarchyLimits,
  I18nConfig,
  InvitationConfig,
  // Context (from types, not schema)
  ContextType,
  Context,
  PermissionContext,
  HierarchicalContext,
  ContextWithMetadata,
  OrganizationContext,
  TeamContext,
  SubteamContext,
  TypedContext,
  ContextResolution,
  ContextValidation,
  // Events
  BaseEvent,
  EntityType,
  RoleChangedEvent,
  PermissionGrantedEvent,
  PermissionDeniedEvent,
  PermissionRevokedEvent,
  EntityCreatedEvent,
  EntityUpdatedEvent,
  EntityDeletedEvent,
  MemberAddedEvent,
  MemberRemovedEvent,
  InvitationCreatedEvent,
  InvitationAcceptedEvent,
  InvitationRejectedEvent,
  InvitationCancelledEvent,
  RoleStatementAddedEvent,
  RoleStatementRemovedEvent,
  AuditHooks,
  AuditEvent,
  // Hooks
  CacheHooks,
  CacheManagerOptions,
  // Statements (from types, not utils)
  StatementId,
  StatementCategory,
  StatementOperation,
  ParsedStatement,
  StatementWithTranslations,
  StatementTranslationMap,
  StatementTranslationData,
  StatementValidation,
  CreateStatementInput,
  StatementTranslationInput,
  UpdateStatementInput,
  // Roles
  RoleType,
  RoleWithStatements,
  RoleSummary,
  CreateRoleInput,
  UpdateRoleInput,
  AddStatementsToRoleInput,
  RemoveStatementsFromRoleInput,
  RoleAssignment,
  RoleValidation,
  RoleConflict,
  RoleQueryOptions,
  RolePermissionsSummary,
  // Invitations (from types, not schema)
  InvitationStatus,
  InvitationWithDetails,
  InvitationSummary,
  CreateInvitationInput,
  AcceptInvitationInput,
  RejectInvitationInput,
  CancelInvitationInput,
  InvitationValidation,
  InvitationQueryOptions,
  InvitationStatistics,
  BulkInvitationInput,
  BulkInvitationResult,
} from './types'

export {
  CacheKeyPatterns,
  CacheTTL,
  CommonStatementCategories,
  CommonStatementOperations,
  buildStatementId,
  parseStatementId,
  validateStatementId,
} from './types'

// Invitation utilities for generating tokens, codes, QR data, etc.
export {
  generateInvitationToken,
  generateInvitationCode,
  isValidInvitationCode,
  generateInvitationLink,
  generateQRCodeData,
  isInvitationExpired,
  canUseInvitation,
  calculateExpirationDate,
} from './utils/invitation-helper'

// Server exports removed - using Better Auth adapter directly

// Note: Utility validators and statement parsers are already exported through './types'