/**
 * Context types - represents the hierarchical levels in the system
 */
export type ContextType = 'organization' | 'team'

/**
 * Context object - represents a specific location in the hierarchy
 */
export interface Context {
  type: ContextType
  id: string
}

/**
 * Permission context - used for permission checks
 * Includes the context and optionally the user making the check
 */
export interface PermissionContext extends Context {
  userId?: string
}

/**
 * Hierarchical context - includes parent information
 * Used when resolving permissions up the hierarchy
 */
export interface HierarchicalContext extends Context {
  parent?: HierarchicalContext
}

/**
 * Context with metadata
 * Generic type allows different metadata shapes for different contexts
 */
export interface ContextWithMetadata<T = Record<string, unknown>> extends Context {
  name: string
  slug: string
  metadata?: T
  createdAt: Date
  updatedAt: Date
}

/**
 * Organization context
 */
export interface OrganizationContext extends ContextWithMetadata {
  type: 'organization'
}

/**
 * Team context with parent reference (organization or another team)
 */
export interface TeamContext extends ContextWithMetadata {
  type: 'team'
  parentType: 'organization' | 'team'
  parentId: string
}

/**
 * Union type of all context types with their specific shapes
 */
export type TypedContext = OrganizationContext | TeamContext

/**
 * Context resolver result - includes the full hierarchy path
 */
export interface ContextResolution {
  context: Context
  organization?: OrganizationContext
  team?: TeamContext
  hierarchy: Context[] // [organization, team?, team?, ...]
}

/**
 * Helper type for context validation
 */
export interface ContextValidation {
  isValid: boolean
  error?: string
  context?: Context
}
