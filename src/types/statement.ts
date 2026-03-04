/**
 * Statement ID format - "category:operation"
 * No wildcards supported as per requirements
 */
export type StatementId = string

/**
 * Statement category - the resource type
 * Examples: "organization", "team", "member", "role", "permission"
 */
export type StatementCategory = string

/**
 * Statement operation - the action to perform
 * Examples: "create", "read", "update", "delete", "list", "invite", "grant", "deny"
 */
export type StatementOperation = string

/**
 * Statement definition with parsed components
 */
export interface ParsedStatement {
  id: StatementId
  category: StatementCategory
  operation: StatementOperation
}

/**
 * Statement with translations
 */
export interface StatementWithTranslations {
  id: StatementId
  category: StatementCategory
  operation: StatementOperation
  translations: StatementTranslationMap
  createdAt: Date
}

/**
 * Statement translation map - keyed by locale
 */
export type StatementTranslationMap = Record<string, StatementTranslationData>

/**
 * Statement translation data
 */
export interface StatementTranslationData {
  locale: string
  name: string
  description?: string
}

/**
 * Statement validation result
 */
export interface StatementValidation {
  isValid: boolean
  error?: string
  parsed?: ParsedStatement
}

/**
 * Create statement input
 */
export interface CreateStatementInput {
  id: StatementId // Must be in format "category:operation"
  translations?: StatementTranslationInput[]
}

/**
 * Statement translation input
 */
export interface StatementTranslationInput {
  locale: string
  name: string
  description?: string
}

/**
 * Update statement input
 */
export interface UpdateStatementInput {
  id: StatementId
  addTranslations?: StatementTranslationInput[]
  removeTranslations?: string[] // Array of locales to remove
}

/**
 * Common statement categories (suggestions, not exhaustive)
 */
export const CommonStatementCategories = {
  ORGANIZATION: 'organization',
  TEAM: 'team',
  MEMBER: 'member',
  ROLE: 'role',
  STATEMENT: 'statement',
  PERMISSION: 'permission',
  INVITATION: 'invitation',
  SETTINGS: 'settings',
} as const

/**
 * Common statement operations (suggestions, not exhaustive)
 */
export const CommonStatementOperations = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  INVITE: 'invite',
  GRANT: 'grant',
  DENY: 'deny',
  REVOKE: 'revoke',
  MANAGE: 'manage',
} as const

/**
 * Helper to build statement IDs
 */
export const buildStatementId = (category: string, operation: string): StatementId => {
  return `${category}:${operation}`
}

/**
 * Helper to parse statement IDs
 */
export const parseStatementId = (id: StatementId): ParsedStatement | null => {
  const parts = id.split(':')
  if (parts.length !== 2) return null

  const [category, operation] = parts
  if (!category || !operation) return null

  return { id, category, operation }
}

/**
 * Helper to validate statement ID format
 */
export const validateStatementId = (id: StatementId): StatementValidation => {
  const parsed = parseStatementId(id)
  if (!parsed) {
    return {
      isValid: false,
      error: 'Statement ID must be in format "category:operation"',
    }
  }

  // Check for invalid characters
  const validPattern = /^[a-z0-9_-]+:[a-z0-9_-]+$/i
  if (!validPattern.test(id)) {
    return {
      isValid: false,
      error: 'Statement ID can only contain letters, numbers, underscores, hyphens, and one colon',
    }
  }

  return {
    isValid: true,
    parsed,
  }
}
