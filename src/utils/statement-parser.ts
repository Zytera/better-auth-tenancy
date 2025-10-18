/**
 * Statement Parser - Utilities for parsing and validating statement IDs
 *
 * Statement format: "category:operation"
 * Examples: "team:create", "patient:read", "settings:update"
 *
 * No wildcards supported as per requirements.
 */

export interface ParsedStatement {
  id: string
  category: string
  operation: string
}

/**
 * Parse statement ID into components
 * Returns null if format is invalid
 */
export function parseStatementId(id: string): ParsedStatement | null {
  if (!id || typeof id !== 'string') return null

  const parts = id.split(':')
  if (parts.length !== 2) return null

  const [category, operation] = parts

  if (!category || !operation) return null
  if (category.trim() === '' || operation.trim() === '') return null

  return {
    id,
    category: category.trim(),
    operation: operation.trim(),
  }
}

/**
 * Build statement ID from components
 */
export function buildStatementId(category: string, operation: string): string {
  if (!category || !operation) {
    throw new Error('Category and operation are required')
  }

  return `${category}:${operation}`
}

/**
 * Validate statement ID format
 */
export function validateStatementId(id: string): {
  isValid: boolean
  error?: string
  parsed?: ParsedStatement
} {
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

