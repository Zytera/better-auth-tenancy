import type { CacheHooks } from './hooks.js'
import type { AuditHooks, ActionHooks } from './events.js'
import type { z } from 'zod'

/**
 * Plugin configuration for Better Auth Tenancy
 * This is the main configuration object passed when initializing the plugin
 */
export interface TenancyConfig {
  /**
   * Endpoint protection configuration
   * Customize authorization logic for each endpoint action.
   *
   * Authorization is FAIL-CLOSED by default:
   * - Write endpoints (create/update/delete/grant/...) reject every request
   *   with 403 when their hook is not configured.
   * - Read endpoints require an authenticated session when their hook is not
   *   configured (anonymous callers get 401).
   *
   * Configure a hook for every operation you intend to expose. A configured
   * hook fully replaces the default and must throw to deny.
   *
   * @example
   * ```typescript
   * endpoints: {
   *   organization: {
   *     // Custom auth for creating organizations
   *     create: async ({ ctx, body }) => {
   *       const user = ctx.context.session?.user
   *       if (!user) throw new Error('Unauthorized')
   *       // Add your custom logic here
   *     },
   *     // Different logic for updates
   *     update: async ({ ctx, body }) => {
   *       const user = ctx.context.session?.user
   *       if (!user) throw new Error('Unauthorized')
   *       // Check ownership or permissions
   *     }
   *   },
   *   team: {
   *     create: async ({ ctx, body }) => {
   *       // Check if user can create teams in this org
   *     }
   *   }
   * }
   * ```
   */
  endpoints?: EndpointConfig

  /**
   * Hierarchy limits - customizable by the user
   * If not specified, no limits are enforced
   */
  limits?: HierarchyLimits

  /**
   * Cache hooks - user implements their own caching strategy
   * (Redis, in-memory, etc.)
   */
  cache?: CacheHooks

  /**
   * Audit hooks - user implements their own audit logging
   * Called AFTER successful operations for logging/auditing purposes
   * These hooks don't have access to ctx and cannot perform rollback
   */
  audit?: AuditHooks

  /**
   * Action hooks - user implements business logic with automatic rollback
   * Called AFTER the database operation with full context access
   * If these hooks throw an error, the operation will be rolled back automatically
   * Use for: user creation, member addition, sending emails, or other side effects
   */
  actions?: ActionHooks

  /**
   * Internationalization configuration
   */
  i18n?: I18nConfig

  /**
   * Invitation configuration
   */
  invitation?: InvitationConfig

  /**
   * Permission filtering hooks for list endpoints
   * Allows users to implement custom logic to filter results based on permissions
   */
  permissionFiltering?: PermissionFilteringHooks

  /**
   * Custom metadata validation schemas
   * Define Zod schemas to validate metadata fields for each entity
   * Better Auth will automatically validate these schemas when creating/updating entities
   *
   * @example
   * ```typescript
   * import { z } from 'zod'
   *
   * schemas: {
   *   organization: {
   *     metadata: z.object({
   *       country: z.string().min(2, 'Country code required'),
   *       industry: z.string().optional(),
   *       employeeCount: z.number().positive().optional()
   *     })
   *   },
   *   team: {
   *     metadata: z.object({
   *       department: z.string(),
   *       budget: z.number().optional()
   *     })
   *   }
   * }
   * ```
   */
  schemas?: MetadataSchemas
}

/**
 * Resource information for endpoints that operate on existing entities
 * Automatically populated by the plugin before calling hooks
 */
export interface ResourceContext {
  /** Context type (organization or team) */
  contextType: 'organization' | 'team'
  /** Context ID (organizationId or teamId) */
  contextId: string
  /** The resource data itself (member, role, permission, etc.) */
  data?: any
}

/**
 * Context passed to endpoint authorization hooks
 */
export interface EndpointAuthContext {
  /** Better Auth endpoint context (contains body, params, query, etc.) */
  ctx: any
  /** Authenticated session (may be null if not authenticated) */
  session: any
  /** Resource context (automatically populated for read/update/delete operations) */
  resource?: ResourceContext
}

/**
 * Endpoint authorization hook
 * Return void or the authenticated user if authorization succeeds
 * Throw an error if authorization fails
 */
export type EndpointAuthHook = (context: EndpointAuthContext) => Promise<void | any>

/**
 * Endpoint protection configuration
 * Each endpoint action can have a custom authorization hook
 */
export interface EndpointConfig {
  organization?: {
    create?: EndpointAuthHook
    read?: EndpointAuthHook
    update?: EndpointAuthHook
    delete?: EndpointAuthHook
    list?: EndpointAuthHook
  }
  team?: {
    create?: EndpointAuthHook
    read?: EndpointAuthHook
    update?: EndpointAuthHook
    delete?: EndpointAuthHook
    list?: EndpointAuthHook
  }
  member?: {
    add?: EndpointAuthHook
    remove?: EndpointAuthHook
    updateRole?: EndpointAuthHook
    list?: EndpointAuthHook
    bulkAdd?: EndpointAuthHook
    bulkRemove?: EndpointAuthHook
    transfer?: EndpointAuthHook
    /**
     * Override for querying ANOTHER user's memberships (getUserMemberships /
     * checkMembership). Self-lookups are always allowed. Undefined = self-only
     * (fail-closed). Must throw to deny — do not reuse the permissive `list` hook.
     */
    getMemberships?: EndpointAuthHook
  }
  role?: {
    create?: EndpointAuthHook
    read?: EndpointAuthHook
    update?: EndpointAuthHook
    delete?: EndpointAuthHook
    addStatement?: EndpointAuthHook
    removeStatement?: EndpointAuthHook
    list?: EndpointAuthHook
  }
  statement?: {
    create?: EndpointAuthHook
    read?: EndpointAuthHook
    update?: EndpointAuthHook
    delete?: EndpointAuthHook
    list?: EndpointAuthHook
    translate?: EndpointAuthHook
    batchCreate?: EndpointAuthHook
  }
  permission?: {
    grant?: EndpointAuthHook
    deny?: EndpointAuthHook
    revoke?: EndpointAuthHook
    check?: EndpointAuthHook
    listGrants?: EndpointAuthHook
    listDenies?: EndpointAuthHook
    /**
     * Override for listing another user's permission contexts
     * (listPermissionContexts). Self-lookups are always allowed. Undefined =
     * self-only (fail-closed). Must throw to deny.
     */
    contexts?: EndpointAuthHook
    grantBatch?: EndpointAuthHook
    denyBatch?: EndpointAuthHook
  }
  invitation?: {
    create?: EndpointAuthHook
    accept?: EndpointAuthHook
    decline?: EndpointAuthHook
    revoke?: EndpointAuthHook
    list?: EndpointAuthHook
    getByToken?: EndpointAuthHook
    cleanupExpired?: EndpointAuthHook
    /**
     * Override for querying invitations by an identifier that is NOT the
     * caller's own email/phone (getInvitationsByIdentifier). Own-identifier
     * lookups are always allowed. Undefined = self-only (fail-closed). Must
     * throw to deny — do not reuse the permissive `list` hook.
     */
    getByIdentifier?: EndpointAuthHook
  }
}

/**
 * Hierarchy limits configuration
 * All limits are optional and customizable by the user
 */
export interface HierarchyLimits {
  /**
   * Maximum number of teams per organization (direct children only)
   * @default undefined (no limit)
   */
  maxTeamsPerOrganization?: number

  /**
   * Maximum number of child teams per team
   * @default undefined (no limit)
   */
  maxChildTeamsPerTeam?: number

  /**
   * Maximum nesting depth for teams (1 = only org→team, 2 = org→team→team, etc.)
   * @default undefined (no limit)
   */
  maxNestingDepth?: number

  /**
   * Maximum number of members in an organization
   * @default undefined (no limit)
   */
  maxMembersPerOrganization?: number

  /**
   * Maximum number of members in a team
   * @default undefined (no limit)
   */
  maxMembersPerTeam?: number

  /**
   * Maximum number of custom roles per organization
   * @default undefined (no limit)
   */
  maxRolesPerOrganization?: number

  /**
   * Maximum number of custom roles per team
   * @default undefined (no limit)
   */
  maxRolesPerTeam?: number

  /**
   * Maximum number of statements that can be assigned to a role
   * @default undefined (no limit)
   */
  maxStatementsPerRole?: number
}

/**
 * Internationalization configuration
 */
export interface I18nConfig {
  /**
   * Default locale to use when Accept-Language header is not present
   * Uses ISO alpha-2 language code format (2 characters)
   * Applied to both statement translations and error messages
   * @default 'en'
   */
  defaultLocale?: string

  /**
   * Custom error message translations
   * Override default error messages or add translations for new languages
   * Uses ISO alpha-2 language codes (2 characters)
   *
   * Built-in translations available: English ('en'), Spanish ('es')
   */
  errorMessages?: Record<string, Record<string, string>>
}

/**
 * Invitation configuration
 */
export interface InvitationConfig {
  /**
   * Default expiration time for invitations (in hours)
   * @default 72 (3 days)
   */
  defaultExpirationHours?: number

  /**
   * Whether to allow multiple pending invitations for the same email
   * @default false
   */
  allowMultiplePendingInvitations?: boolean
}

/**
 * Permission filtering hooks for list endpoints
 * Allows users to implement custom filtering logic based on permissions
 */
export interface PermissionFilteringHooks {
  /**
   * Filter organizations list based on user permissions
   *
   * @param ctx - Better Auth endpoint context (contains session, params, query, etc.)
   * @param organizations - Array of organizations from the database
   * @returns Promise<Array> - Filtered array of organizations the user can see
   *
   * If not provided, all organizations are returned (no filtering)
   */
  filterOrganizations?: <T>(
    ctx: any,
    organizations: T[]
  ) => Promise<T[]>

  /**
   * Filter teams list based on user permissions
   *
   * @param ctx - Better Auth endpoint context (contains session, params, query, etc.)
   * @param teams - Array of teams from the database
   * @param context - Additional context (parentType, parentId)
   * @returns Promise<Array> - Filtered array of teams the user can see
   *
   * If not provided, all teams are returned (no filtering)
   */
  filterTeams?: <T>(
    ctx: any,
    teams: T[],
    context: { parentType: string; parentId: string }
  ) => Promise<T[]>

  /**
   * Filter organization members list based on user permissions
   *
   * @param ctx - Better Auth endpoint context (contains session, params, query, etc.)
   * @param members - Array of members from the database
   * @param context - Additional context (organizationId)
   * @returns Promise<Array> - Filtered array of members the user can see
   *
   * If not provided, all members are returned (no filtering)
   */
  filterOrganizationMembers?: <T>(
    ctx: any,
    members: T[],
    context: { organizationId: string }
  ) => Promise<T[]>

  /**
   * Filter team members list based on user permissions
   *
   * @param ctx - Better Auth endpoint context (contains session, params, query, etc.)
   * @param members - Array of members from the database
   * @param context - Additional context (teamId, parentType, parentId)
   * @returns Promise<Array> - Filtered array of members the user can see
   *
   * If not provided, all members are returned (no filtering)
   */
  filterTeamMembers?: <T>(
    ctx: any,
    members: T[],
    context: { teamId: string; parentType: string; parentId: string }
  ) => Promise<T[]>
}

/**
 * Custom metadata validation schemas
 * Define Zod schemas to validate metadata fields for each entity type
 * Better Auth will automatically validate the request body using these schemas
 */
export interface MetadataSchemas {
  /**
   * Organization metadata schema
   * Validates the metadata field when creating or updating organizations
   */
  organization?: {
    metadata?: z.ZodType<any>
  }

  /**
   * Team metadata schema
   * Validates the metadata field when creating or updating teams
   */
  team?: {
    metadata?: z.ZodType<any>
  }

  /**
   * Member metadata schema (applies to organization and team members)
   * Validates the metadata field when adding or updating members
   */
  member?: {
    metadata?: z.ZodType<any>
  }

  /**
   * Invitation metadata schema
   * Validates the metadata field when creating invitations
   */
  invitation?: {
    metadata?: z.ZodType<any>
  }
}
