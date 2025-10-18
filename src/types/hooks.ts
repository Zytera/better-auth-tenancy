/**
 * Cache Hooks interface
 * User implements these to provide their own caching strategy
 * Can be Redis, in-memory, file-based, or any other caching mechanism
 */
export interface CacheHooks {
  /**
   * Get a value from cache
   * @param key - Cache key
   * @returns The cached value or null if not found/expired
   */
  get: <T = unknown>(key: string) => Promise<T | null>

  /**
   * Set a value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (optional)
   */
  set: <T = unknown>(key: string, value: T, ttl?: number) => Promise<void>

  /**
   * Invalidate cache entries matching a pattern
   * @param pattern - Pattern to match keys (e.g., "user:123:*", "statements:*")
   * Implementation should support glob patterns or prefixes
   */
  invalidate: (pattern: string) => Promise<void>

  /**
   * Delete a specific cache key
   * @param key - Cache key to delete
   */
  delete?: (key: string) => Promise<void>

  /**
   * Clear all cache entries
   * Optional - only needed if full cache reset is desired
   */
  clear?: () => Promise<void>
}

/**
 * Cache key patterns used by the plugin
 * These are the patterns that will be used for cache invalidation
 */
export const CacheKeyPatterns = {
  // User permissions cache
  userPermissions: (userId: string) => `better-auth-tenancy:user:${userId}:permissions:*`,
  userPermissionInContext: (userId: string, contextType: string, contextId: string) =>
    `better-auth-tenancy:user:${userId}:permissions:${contextType}:${contextId}:*`,

  // Statement cache
  statements: () => `better-auth-tenancy:statements:*`,
  statement: (statementId: string) => `better-auth-tenancy:statement:${statementId}`,
  statementTranslations: (statementId: string) =>
    `better-auth-tenancy:statement:${statementId}:translations:*`,

  // Role cache
  roleStatements: (roleId: string) => `better-auth-tenancy:role:${roleId}:statements`,
  organizationRoles: (organizationId: string) =>
    `better-auth-tenancy:organization:${organizationId}:roles:*`,
  teamRoles: (teamId: string) => `better-auth-tenancy:team:${teamId}:roles:*`, // Subteams use team roles

  // Member cache
  organizationMembers: (organizationId: string) =>
    `better-auth-tenancy:organization:${organizationId}:members:*`,
  teamMembers: (teamId: string) => `better-auth-tenancy:team:${teamId}:members:*`,
  subteamMembers: (subteamId: string) => `better-auth-tenancy:subteam:${subteamId}:members:*`,
  userMemberships: (userId: string) => `better-auth-tenancy:user:${userId}:memberships:*`,

  // Hierarchy cache
  hierarchy: (contextType: string, contextId: string) =>
    `better-auth-tenancy:hierarchy:${contextType}:${contextId}`,
  teamsByOrganization: (organizationId: string) =>
    `better-auth-tenancy:organization:${organizationId}:teams`,
  subteamsByTeam: (teamId: string) => `better-auth-tenancy:team:${teamId}:subteams`,

  // Invitation cache
  invitations: (contextType: string, contextId: string) =>
    `better-auth-tenancy:invitations:${contextType}:${contextId}:*`,
  invitationByToken: (token: string) => `better-auth-tenancy:invitation:token:${token}`,
  invitationsByEmail: (email: string) => `better-auth-tenancy:invitations:email:${email}:*`,
} as const

/**
 * Cache TTL constants (in seconds)
 * These are recommended defaults, but users can override them
 */
export const CacheTTL = {
  // Long-lived cache (rarely changes)
  statements: 3600, // 1 hour
  roles: 1800, // 30 minutes
  hierarchy: 1800, // 30 minutes

  // Medium-lived cache
  permissions: 600, // 10 minutes
  members: 600, // 10 minutes

  // Short-lived cache
  invitations: 300, // 5 minutes
  userSession: 300, // 5 minutes
} as const

/**
 * Cache manager options
 * Configuration for internal cache management
 */
export interface CacheManagerOptions {
  /**
   * Whether to enable caching
   * @default true
   */
  enabled?: boolean

  /**
   * Default TTL for cache entries (in seconds)
   * @default 600 (10 minutes)
   */
  defaultTTL?: number

  /**
   * Custom TTL overrides
   */
  customTTL?: Partial<typeof CacheTTL>

  /**
   * Cache key prefix
   * @default 'better-auth-tenancy'
   */
  keyPrefix?: string
}