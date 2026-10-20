import type { TenancyConfig } from '../types/index.js'
import type { BetterAuthPlugin } from 'better-auth'
import { organizationEndpoints } from './organizations.js'
import { teamEndpoints } from './teams.js'
import { statementEndpoints } from './statements.js'
import { roleEndpoints } from './roles.js'
import { memberEndpoints } from './members.js'
import { invitationEndpoints } from './invitations.js'
import { permissionEndpoints } from './permissions.js'

/**
 * Better Auth Tenancy Plugin
 *
 * Multi-tenant organizations with hierarchical RBAC.
 * Complete workspace management with teams, roles, and permissions.
 * Teams support unlimited nesting via parentType/parentId.
 *
 * @example
 * ```typescript
 * import { betterAuth } from 'better-auth'
 * import { tenancy } from '@zytera/better-auth-tenancy/server'
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     tenancy({
 *       limits: {
 *         maxTeamsPerOrganization: 100,
 *         maxMembersPerOrganization: 10000,
 *       },
 *       cache: {
 *         async get(key) { return redis.get(key) },
 *         async set(key, value, ttl) { return redis.set(key, value, 'EX', ttl) },
 *         async invalidate(pattern) { return redis.del(pattern) },
 *       },
 *       audit: {
 *         async onEntityCreated(event) {
 *           console.log('Entity created:', event)
 *         },
 *         async onPermissionGranted(event) {
 *           console.log('Permission granted:', event)
 *         },
 *       }
 *     })
 *   ]
 * })
 * ```
 */
export function tenancy(config?: TenancyConfig) {
  validateConfig(config)

  // `satisfies` keeps the return type inference of the literal object
  // (concrete `endpoints` types) while still validating the plugin shape.
  // Annotating the return as bare `BetterAuthPlugin` widens the type and
  // erases the endpoint types from `auth.api` in consumer code — same
  // widening issue the client plugin guards against below.
  return {
    id: 'better-auth-tenancy',
    endpoints: {
      ...organizationEndpoints(config),
      ...teamEndpoints(config),
      ...statementEndpoints(config),
      ...roleEndpoints(config),
      ...memberEndpoints(config),
      ...invitationEndpoints(config),
      ...permissionEndpoints(config),
    },
    options: config,
    schema: {
      // Organizations
      organization: {
        fields: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: true },
          slug: { type: 'string', required: true, unique: true },
          metadata: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      // Teams (with unlimited nesting via parentType/parentId)
      team: {
        fields: {
          id: { type: 'string', required: true },
          parentType: { type: 'string', required: true },
          parentId: { type: 'string', required: true },
          name: { type: 'string', required: true },
          slug: { type: 'string', required: true },
          metadata: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      // Statements
      statement: {
        fields: {
          id: { type: 'string', required: true },
          category: { type: 'string', required: true },
          operation: { type: 'string', required: true },
          createdAt: { type: 'date', required: true },
        },
      },
      statementTranslation: {
        fields: {
          id: { type: 'string', required: true },
          statementId: { type: 'string', required: true, references: { model: 'statement', field: 'id' } },
          locale: { type: 'string', required: true },
          name: { type: 'string', required: true },
          description: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
        },
      },
      // Roles
      role: {
        fields: {
          id: { type: 'string', required: true },
          contextType: { type: 'string', required: true },
          contextId: { type: 'string', required: true },
          name: { type: 'string', required: true },
          description: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      roleStatement: {
        fields: {
          id: { type: 'string', required: true },
          roleId: { type: 'string', required: true, references: { model: 'role', field: 'id' } },
          statementId: { type: 'string', required: true, references: { model: 'statement', field: 'id' } },
          createdAt: { type: 'date', required: true },
        },
      },
      roleTranslation: {
        fields: {
          id: { type: 'string', required: true },
          roleId: { type: 'string', required: true, references: { model: 'role', field: 'id' } },
          locale: { type: 'string', required: true },
          name: { type: 'string', required: true },
          description: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
        },
      },
      // Members
      member: {
        fields: {
          id: { type: 'string', required: true },
          contextType: { type: 'string', required: true },
          contextId: { type: 'string', required: true },
          userId: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          roleId: { type: 'string', required: false, references: { model: 'role', field: 'id' } },
          metadata: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      // Permissions
      permissionGrant: {
        fields: {
          id: { type: 'string', required: true },
          userId: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          statementId: { type: 'string', required: true, references: { model: 'statement', field: 'id' } },
          contextType: { type: 'string', required: true },
          contextId: { type: 'string', required: true },
          expiresAt: { type: 'date', required: false },
          grantedBy: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          createdAt: { type: 'date', required: true },
        },
      },
      permissionDeny: {
        fields: {
          id: { type: 'string', required: true },
          userId: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          statementId: { type: 'string', required: true, references: { model: 'statement', field: 'id' } },
          contextType: { type: 'string', required: true },
          contextId: { type: 'string', required: true },
          deniedBy: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          createdAt: { type: 'date', required: true },
        },
      },
      // Invitations
      invitation: {
        fields: {
          id: { type: 'string', required: true },
          token: { type: 'string', required: true, unique: true },
          invitationCode: { type: 'string', required: false },
          identifier: { type: 'string', required: false },
          contextType: { type: 'string', required: true },
          contextId: { type: 'string', required: true },
          roleId: { type: 'string', required: false },
          invitedBy: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          status: { type: 'string', required: true },
          expiresAt: { type: 'date', required: false },
          createdAt: { type: 'date', required: true },
          acceptedAt: { type: 'date', required: false },
          cancelledAt: { type: 'date', required: false },
          metadata: { type: 'string', required: false },
        },
      },
    } as any,
  } satisfies BetterAuthPlugin
}

/**
 * Validate plugin configuration
 */
function validateConfig(config?: TenancyConfig): void {
  if (!config) return

  // Validate cache hooks
  if (config.cache) {
    if (typeof config.cache.get !== 'function') {
      throw new Error('[BetterAuthTenancy] cache.get must be a function')
    }
    if (typeof config.cache.set !== 'function') {
      throw new Error('[BetterAuthTenancy] cache.set must be a function')
    }
    if (typeof config.cache.invalidate !== 'function') {
      throw new Error('[BetterAuthTenancy] cache.invalidate must be a function')
    }
  }

  // Validate audit hooks (all optional)
  if (config.audit) {
    const hooks = Object.values(config.audit)
    for (const hook of hooks) {
      if (hook && typeof hook !== 'function') {
        throw new Error('[BetterAuthTenancy] All audit hooks must be functions')
      }
    }
  }

  // Validate limits (all optional)
  if (config.limits) {
    const limits = Object.values(config.limits)
    for (const limit of limits) {
      if (limit !== undefined && (typeof limit !== 'number' || limit <= 0)) {
        throw new Error('[BetterAuthTenancy] All limits must be positive numbers')
      }
    }
  }

  // Validate invitation config
  if (config.invitation?.defaultExpirationHours !== undefined && config.invitation.defaultExpirationHours <= 0) {
    throw new Error('[BetterAuthTenancy] invitation.defaultExpirationHours must be a positive number')
  }
}

/**
 * Type guard to check if a plugin is Better Auth Tenancy
 */
export function isTenancyPlugin(plugin: unknown): plugin is BetterAuthPlugin {
  return (
    typeof plugin === 'object' &&
    plugin !== null &&
    'id' in plugin &&
    plugin.id === 'better-auth-tenancy'
  )
}

// Re-export types for convenience
export type { TenancyConfig } from '../types/config.js'
