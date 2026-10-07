import type { StatementId } from './statement'
import type { ContextType } from './context'

export type RoleType = 'organization' | 'team'

export interface RoleTranslationData {
  locale: string
  name: string
  description?: string
}

export interface RoleTranslationInput {
  locale: string
  name: string
  description?: string
}

/**
 * Role with statements
 */
export interface RoleWithStatements {
  id: string
  name: string
  description?: string
  contextType: RoleType
  contextId: string
  statements: StatementId[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Role summary (without statements)
 */
export interface RoleSummary {
  id: string
  name: string
  description?: string
  contextType: RoleType
  contextId: string
  statementCount: number
  createdAt: Date
}

/**
 * Create role input
 */
export interface CreateRoleInput {
  name: string
  description?: string
  contextType: RoleType
  contextId: string
  statements?: StatementId[] // Optional initial statements
}

/**
 * Update role input
 */
export interface UpdateRoleInput {
  id: string
  name?: string
  description?: string
}

/**
 * Add statements to role input
 */
export interface AddStatementsToRoleInput {
  roleId: string
  statements: StatementId[]
}

/**
 * Remove statements from role input
 */
export interface RemoveStatementsFromRoleInput {
  roleId: string
  statements: StatementId[]
}

/**
 * Role assignment - links a user to a role in a context
 */
export interface RoleAssignment {
  userId: string
  roleId: string
  contextType: ContextType
  contextId: string
  assignedAt: Date
}

/**
 * Role validation result
 */
export interface RoleValidation {
  isValid: boolean
  error?: string
}

/**
 * Role conflict check - used when assigning roles in hierarchy
 */
export interface RoleConflict {
  hasConflict: boolean
  conflictingRole?: {
    roleId: string
    roleName: string
    contextType: ContextType
    contextId: string
  }
  message?: string
}

/**
 * Role query options
 */
export interface RoleQueryOptions {
  contextType?: RoleType
  contextId?: string
  includeStatements?: boolean
  limit?: number
  offset?: number
}

/**
 * Role permissions summary - for displaying what a role can do
 */
export interface RolePermissionsSummary {
  roleId: string
  roleName: string
  statementsByCategory: Record<string, StatementId[]>
  totalStatements: number
}
