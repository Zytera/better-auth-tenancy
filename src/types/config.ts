import type { CacheHooks } from './hooks'
import type { AuditHooks } from './events'

/**
 * Plugin configuration for Better Auth Tenancy
 * This is the main configuration object passed when initializing the plugin
 */
export interface TenancyConfig {
  /**
   * Endpoint protection configuration
   * Customize authorization logic for each endpoint action
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
   * Called on role changes, permission grants/denies, entity creation/deletion
   */
  audit?: AuditHooks

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
}

/**
 * Resource information for endpoints that operate on existing entities
 * Automatically populated by the plugin before calling hooks
 */
export interface ResourceContext {
  /** Context type (organization, team, or subteam) */
  contextType: 'organization' | 'team' | 'subteam'
  /** Context ID (organizationId, teamId, or subteamId) */
  contextId: string
  /** The resource data itself (member, role, permission, etc.) */
  data?: any
}

/**
 * Context passed to endpoint authorization hooks
 */
export interface EndpointAuthContext {
  /** Better Auth endpoint context */
  ctx: any
  /** Request body data */
  body?: any
  /** Request params */
  params?: any
  /** Request query */
  query?: any
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
 *
 * @example
 * ```typescript
 * endpoints: {
 *   organization: {
 *     create: async ({ ctx, body }) => {
 *       // Custom auth: only allow if user has 'org:create' permission
 *       const user = ctx.context.session?.user
 *       if (!user) throw new Error('Unauthorized')
 *
 *       const canCreate = await checkPermission(user.id, 'org:create')
 *       if (!canCreate) throw new Error('Permission denied')
 *     },
 *     update: async ({ ctx, body }) => {
 *       // Different logic for updates
 *       const user = ctx.context.session?.user
 *       if (!user) throw new Error('Unauthorized')
 *
 *       // Only allow updating your own organizations
 *       const org = await getOrg(body.id)
 *       if (org.ownerId !== user.id) throw new Error('Not the owner')
 *     }
 *   }
 * }
 * ```
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
  subteam?: {
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
  }
}

/**
 * Hierarchy limits configuration
 * All limits are optional and customizable by the user
 */
export interface HierarchyLimits {
  /**
   * Maximum number of teams per organization
   * @default undefined (no limit)
   */
  maxTeamsPerOrganization?: number

  /**
   * Maximum number of subteams per team
   * @default undefined (no limit)
   */
  maxSubteamsPerTeam?: number

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
   * Maximum number of members in a subteam
   * @default undefined (no limit)
   */
  maxMembersPerSubteam?: number

  /**
   * Maximum number of custom roles per organization
   * @default undefined (no limit)
   */
  maxRolesPerOrganization?: number

  /**
   * Maximum number of custom roles per team
   * Note: Subteams use team roles, so this limit applies to both teams and their subteams
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
   * Default locale for statement names and descriptions
   * @default 'en'
   */
  defaultLocale?: string

  /**
   * List of supported locales
   * @default ['en']
   */
  supportedLocales?: string[]
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
 *
 * @example
 * ```typescript
 * permissionFiltering: {
 *   filterOrganizations: async (userId, organizations, context) => {
 *     // Custom logic: implement your own filtering based on business rules
 *     // Example: filter by custom criteria, metadata, etc.
 *     return organizations
 *   },
 *   filterTeams: async (userId, teams, context) => {
 *     // Custom logic: only show teams where user has 'team:read' permission
 *     return teams.filter(async (team) => {
 *       return await hasPermission(userId, 'team:read', 'team', team.id)
 *     })
 *   },
 *   filterSubteams: async (userId, subteams, context) => {
 *     // Custom logic: show all subteams for admins, filter for others
 *     if (context.isAdmin) return subteams
 *     return subteams.filter(async (subteam) => {
 *       return await hasPermission(userId, 'subteam:read', 'subteam', subteam.id)
 *     })
 *   }
 * }
 * ```
 */
export interface PermissionFilteringHooks {
  /**
   * Filter organizations list based on user permissions
   *
   * @param userId - The ID of the user requesting the list
   * @param organizations - Array of organizations from the database
   * @param context - Additional context (if any)
   * @returns Promise<Array> - Filtered array of organizations the user can see
   *
   * If not provided, all organizations are returned (no filtering)
   */
  filterOrganizations?: <T>(
    userId: string,
    organizations: T[],
    context?: Record<string, unknown>
  ) => Promise<T[]>

  /**
   * Filter teams list based on user permissions
   *
   * @param userId - The ID of the user requesting the list
   * @param teams - Array of teams from the database
   * @param context - Additional context (organizationId, etc.)
   * @returns Promise<Array> - Filtered array of teams the user can see
   *
   * If not provided, all teams are returned (no filtering)
   */
  filterTeams?: <T>(
    userId: string,
    teams: T[],
    context: { organizationId: string }
  ) => Promise<T[]>

  /**
   * Filter subteams list based on user permissions
   *
   * @param userId - The ID of the user requesting the list
   * @param subteams - Array of subteams from the database
   * @param context - Additional context (teamId, organizationId, etc.)
   * @returns Promise<Array> - Filtered array of subteams the user can see
   *
   * If not provided, all subteams are returned (no filtering)
   */
  filterSubteams?: <T>(
    userId: string,
    subteams: T[],
    context: { teamId: string; organizationId: string }
  ) => Promise<T[]>

  /**
   * Filter organization members list based on user permissions
   *
   * @param userId - The ID of the user requesting the list
   * @param members - Array of members from the database
   * @param context - Additional context (organizationId, etc.)
   * @returns Promise<Array> - Filtered array of members the user can see
   *
   * If not provided, all members are returned (no filtering)
   */
  filterOrganizationMembers?: <T>(
    userId: string,
    members: T[],
    context: { organizationId: string }
  ) => Promise<T[]>

  /**
   * Filter team members list based on user permissions
   *
   * @param userId - The ID of the user requesting the list
   * @param members - Array of members from the database
   * @param context - Additional context (teamId, organizationId, etc.)
   * @returns Promise<Array> - Filtered array of members the user can see
   *
   * If not provided, all members are returned (no filtering)
   */
  filterTeamMembers?: <T>(
    userId: string,
    members: T[],
    context: { teamId: string; organizationId: string }
  ) => Promise<T[]>

  /**
   * Filter subteam members list based on user permissions
   *
   * @param userId - The ID of the user requesting the list
   * @param members - Array of members from the database
   * @param context - Additional context (subteamId, teamId, organizationId, etc.)
   * @returns Promise<Array> - Filtered array of members the user can see
   *
   * If not provided, all members are returned (no filtering)
   */
  filterSubteamMembers?: <T>(
    userId: string,
    members: T[],
    context: { subteamId: string; teamId: string; organizationId: string }
  ) => Promise<T[]>
}