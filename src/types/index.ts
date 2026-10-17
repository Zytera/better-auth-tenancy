/**
 * Better Auth Tenancy - TypeScript Types
 *
 * This file exports all TypeScript types for the Better Auth Tenancy plugin.
 * Types are organized into logical groups:
 *
 * 1. Configuration: Plugin configuration and setup
 * 2. Context: Hierarchical context types
 * 3. Events: Audit event types
 * 4. Hooks: Cache and audit hooks
 * 5. Statements: Permission statement types
 * 6. Roles: Custom role types
 * 7. Invitations: Invitation system types
 */

// Configuration
export type {
  TenancyConfig,
  EndpointConfig,
  HierarchyLimits,
  I18nConfig,
  InvitationConfig,
} from './config.js'

// Context
export type {
  ContextType,
  Context,
  PermissionContext,
  HierarchicalContext,
  ContextWithMetadata,
  OrganizationContext,
  TeamContext,
  TypedContext,
  ContextResolution,
  ContextValidation,
} from './context.js'

// Events
export type {
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
  ActionHooks,
} from './events.js'

// Hooks
export type {
  CacheHooks,
  CacheManagerOptions,
} from './hooks.js'

export {
  CacheKeyPatterns,
  CacheTTL,
} from './hooks.js'

// Statements
export type {
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
} from './statement.js'

export {
  CommonStatementCategories,
  CommonStatementOperations,
  buildStatementId,
  parseStatementId,
  validateStatementId,
} from './statement.js'

// Roles
export type {
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
} from './role.js'

// Invitations
export type {
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
} from './invitation.js'
