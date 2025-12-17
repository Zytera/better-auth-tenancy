import type { TenancyConfig } from '../types'
import type { BetterAuthPlugin } from 'better-auth'
import { organizationEndpoints } from './organizations'
import { teamEndpoints } from './teams'
import { subteamEndpoints } from './subteams'
import { statementEndpoints } from './statements'
import { roleEndpoints } from './roles'
import { memberEndpoints } from './members'
import { invitationEndpoints } from './invitations'
import { permissionEndpoints } from './permissions'

/**
 * Better Auth Tenancy Plugin
 *
 * Multi-tenant organizations with hierarchical RBAC.
 * Complete workspace management with teams, roles, and permissions.
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
export function tenancy(config?: TenancyConfig): BetterAuthPlugin {
  validateConfig(config)

  return {
    id: 'better-auth-tenancy',
    endpoints: {
      ...organizationEndpoints(config),
      ...teamEndpoints(config),
      ...subteamEndpoints(config),
      ...statementEndpoints(config),
      ...roleEndpoints(config),
      ...memberEndpoints(config),
      ...invitationEndpoints(config),
      ...permissionEndpoints(config),
    },
    options: config,
    schema: {
      // Organizations, Teams, Subteams
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
      team: {
        fields: {
          id: { type: 'string', required: true },
          organizationId: { type: 'string', required: true, references: { model: 'organization', field: 'id' } },
          name: { type: 'string', required: true },
          slug: { type: 'string', required: true },
          metadata: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      subteam: {
        fields: {
          id: { type: 'string', required: true },
          teamId: { type: 'string', required: true, references: { model: 'team', field: 'id' } },
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
      organizationRole: {
        fields: {
          id: { type: 'string', required: true },
          organizationId: { type: 'string', required: true, references: { model: 'organization', field: 'id' } },
          name: { type: 'string', required: true },
          description: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      organizationRoleStatement: {
        fields: {
          id: { type: 'string', required: true },
          roleId: { type: 'string', required: true, references: { model: 'organizationRole', field: 'id' } },
          statementId: { type: 'string', required: true, references: { model: 'statement', field: 'id' } },
          createdAt: { type: 'date', required: true },
        },
      },
      teamRole: {
        fields: {
          id: { type: 'string', required: true },
          teamId: { type: 'string', required: true, references: { model: 'team', field: 'id' } },
          name: { type: 'string', required: true },
          description: { type: 'string', required: false },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      teamRoleStatement: {
        fields: {
          id: { type: 'string', required: true },
          roleId: { type: 'string', required: true, references: { model: 'teamRole', field: 'id' } },
          statementId: { type: 'string', required: true, references: { model: 'statement', field: 'id' } },
          createdAt: { type: 'date', required: true },
        },
      },
      // Members
      organizationMember: {
        fields: {
          id: { type: 'string', required: true },
          organizationId: { type: 'string', required: true, references: { model: 'organization', field: 'id' } },
          userId: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          roleId: { type: 'string', required: false, references: { model: 'organizationRole', field: 'id' } },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      teamMember: {
        fields: {
          id: { type: 'string', required: true },
          teamId: { type: 'string', required: true, references: { model: 'team', field: 'id' } },
          userId: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          roleId: { type: 'string', required: false, references: { model: 'teamRole', field: 'id' } },
          createdAt: { type: 'date', required: true },
          updatedAt: { type: 'date', required: true },
        },
      },
      subteamMember: {
        fields: {
          id: { type: 'string', required: true },
          subteamId: { type: 'string', required: true, references: { model: 'subteam', field: 'id' } },
          userId: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          roleId: { type: 'string', required: false, references: { model: 'teamRole', field: 'id' } },
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
  }
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
export type { TenancyConfig } from '../types/config'