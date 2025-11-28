import type { ContextType } from './context'

/**
 * Base event type - common fields for all audit events
 */
export interface BaseEvent {
  timestamp: Date
  [key: string]: unknown // Allow additional custom fields
}

/**
 * Entity types that can be created/deleted
 */
export type EntityType = 'organization' | 'team' | 'subteam' | 'role' | 'statement' | 'member'

/**
 * Role Changed Event
 * Fired when a user's role is updated in any context
 */
export interface RoleChangedEvent extends BaseEvent {
  userId: string
  contextType: ContextType
  contextId: string
  oldRoleId: string | null
  newRoleId: string | null
  changedBy: string
}

/**
 * Permission Granted Event
 * Fired when an explicit permission grant is created
 */
export interface PermissionGrantedEvent extends BaseEvent {
  userId: string
  statementId: string
  contextType: ContextType
  contextId: string
  expiresAt?: Date
  grantedBy: string
}

/**
 * Permission Denied Event
 * Fired when an explicit permission deny is created
 */
export interface PermissionDeniedEvent extends BaseEvent {
  userId: string
  statementId: string
  contextType: ContextType
  contextId: string
  deniedBy: string
}

/**
 * Permission Revoked Event
 * Fired when a grant or deny is removed
 */
export interface PermissionRevokedEvent extends BaseEvent {
  type: 'grant' | 'deny'
  permissionId: string
  userId: string
  statementId: string
  contextType: ContextType
  contextId: string
  revokedBy: string
}

/**
 * Entity Created Event
 * Fired when any entity is created (organization, team, subteam, role, statement, etc.)
 */
export interface EntityCreatedEvent extends BaseEvent {
  entityType: EntityType
  entityId: string
  entityName?: string
  parentContext?: {
    type: ContextType
    id: string
  }
  createdBy: string
  metadata?: Record<string, unknown>
}

/**
 * Entity Updated Event
 * Fired when any entity is updated
 */
export interface EntityUpdatedEvent extends BaseEvent {
  entityType: EntityType
  entityId: string
  changes: Record<string, { old: unknown; new: unknown }>
  updatedBy: string
}

/**
 * Entity Deleted Event
 * Fired when any entity is deleted
 */
export interface EntityDeletedEvent extends BaseEvent {
  entityType: EntityType
  entityId: string
  entityName?: string
  deletedBy: string
  cascadeInfo?: {
    deletedChildren: Array<{
      type: EntityType
      id: string
      count?: number
    }>
  }
}

/**
 * Member Added Event
 * Fired when a user is added to a context (organization, team, or subteam)
 */
export interface MemberAddedEvent extends BaseEvent {
  userId: string
  contextType: ContextType
  contextId: string
  roleId?: string
  addedBy: string
}

/**
 * Member Removed Event
 * Fired when a user is removed from a context
 */
export interface MemberRemovedEvent extends BaseEvent {
  userId: string
  contextType: ContextType
  contextId: string
  removedBy: string
}

/**
 * Invitation Created Event
 * Fired when an invitation is created
 */
export interface InvitationCreatedEvent extends BaseEvent {
  invitationId: string
  identifier: string
  contextType: ContextType
  contextId: string
  roleId: string | null
  invitedBy: string
  token: string
  expiresAt: Date
}

/**
 * Invitation Accepted Event
 * Fired when a user accepts an invitation
 * Note: User creation and member addition should be handled in this hook
 */
export interface InvitationAcceptedEvent extends BaseEvent {
  invitationId: string
  identifier: string
  contextType: ContextType
  contextId: string
  roleId: string | null
}

/**
 * Invitation Rejected Event
 * Fired when a user rejects an invitation
 */
export interface InvitationRejectedEvent extends BaseEvent {
  invitationId: string
  identifier: string
  contextType: ContextType
  contextId: string
}

/**
 * Invitation Cancelled Event
 * Fired when an invitation is cancelled by an admin
 */
export interface InvitationCancelledEvent extends BaseEvent {
  invitationId: string
  identifier: string
  contextType: ContextType
  contextId: string
  cancelledBy: string
}

/**
 * Role Statement Added Event
 * Fired when a statement is added to a role
 */
export interface RoleStatementAddedEvent extends BaseEvent {
  roleId: string
  roleName: string
  statementId: string
  contextType: 'organization' | 'team'
  contextId: string
  addedBy: string
}

/**
 * Role Statement Removed Event
 * Fired when a statement is removed from a role
 */
export interface RoleStatementRemovedEvent extends BaseEvent {
  roleId: string
  roleName: string
  statementId: string
  contextType: 'organization' | 'team'
  contextId: string
  removedBy: string
}

/**
 * Audit Hooks interface
 * User implements these to handle audit events
 */
export interface AuditHooks {
  onRoleChanged?: (event: RoleChangedEvent) => Promise<void> | void
  onPermissionGranted?: (event: PermissionGrantedEvent) => Promise<void> | void
  onPermissionDenied?: (event: PermissionDeniedEvent) => Promise<void> | void
  onPermissionRevoked?: (event: PermissionRevokedEvent) => Promise<void> | void
  onEntityCreated?: (event: EntityCreatedEvent) => Promise<void> | void
  onEntityUpdated?: (event: EntityUpdatedEvent) => Promise<void> | void
  onEntityDeleted?: (event: EntityDeletedEvent) => Promise<void> | void
  onMemberAdded?: (event: MemberAddedEvent) => Promise<void> | void
  onMemberRemoved?: (event: MemberRemovedEvent) => Promise<void> | void
  onInvitationCreated?: (event: InvitationCreatedEvent) => Promise<void> | void
  onInvitationAccepted?: (event: InvitationAcceptedEvent) => Promise<void> | void
  onInvitationRejected?: (event: InvitationRejectedEvent) => Promise<void> | void
  onInvitationCancelled?: (event: InvitationCancelledEvent) => Promise<void> | void
  onRoleStatementAdded?: (event: RoleStatementAddedEvent) => Promise<void> | void
  onRoleStatementRemoved?: (event: RoleStatementRemovedEvent) => Promise<void> | void
}

/**
 * Union type of all events
 */
export type AuditEvent =
  | RoleChangedEvent
  | PermissionGrantedEvent
  | PermissionDeniedEvent
  | PermissionRevokedEvent
  | EntityCreatedEvent
  | EntityUpdatedEvent
  | EntityDeletedEvent
  | MemberAddedEvent
  | MemberRemovedEvent
  | InvitationCreatedEvent
  | InvitationAcceptedEvent
  | InvitationRejectedEvent
  | InvitationCancelledEvent
  | RoleStatementAddedEvent
  | RoleStatementRemovedEvent;


/**
 * Action Hooks interface
 * These hooks are called AFTER the database operation with full context access
 * They have access to the adapter, session, and ctx for performing additional operations
 * If an action hook throws an error, the database operation will be automatically rolled back
 *
 * Action hooks are intended for:
 * - Creating related entities (e.g., creating a user when accepting an invitation)
 * - Adding members to organizations/teams after invitation acceptance
 * - Executing side effects that need to be atomic with the main operation
 *
 * For simple logging/auditing without side effects, use AuditHooks instead
 */
export interface ActionHooks {
  /**
   * Called AFTER creating an invitation in the database
   * If this hook throws, the invitation will be deleted (automatic rollback)
   * Use this for sending emails, creating related records, etc.
   */
  onInvitationCreated?: (event: InvitationCreatedEvent, ctx: any) => Promise<void> | void

  /**
   * Called AFTER updating invitation status to 'accepted'
   * If this hook throws, the invitation status will be reverted to 'pending' (automatic rollback)
   * Use this for creating the user account, adding them as a member, etc.
   */
  onInvitationAccepted?: (event: InvitationAcceptedEvent, ctx: any) => Promise<void> | void

  /**
   * Called AFTER updating invitation status to 'rejected'
   * If this hook throws, the invitation status will be reverted to 'pending' (automatic rollback)
   */
  onInvitationRejected?: (event: InvitationRejectedEvent, ctx: any) => Promise<void> | void

  /**
   * Called AFTER updating invitation status to 'cancelled'
   * If this hook throws, the invitation status will be reverted to 'pending' (automatic rollback)
   */
  onInvitationCancelled?: (event: InvitationCancelledEvent, ctx: any) => Promise<void> | void
}