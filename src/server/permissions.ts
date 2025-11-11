import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { PermissionGrant, PermissionDeny } from '../schema'
import type { ContextType } from '../types/context'
import type { StatementId } from '../types/statement'
import type { TenancyConfig, ResourceContext } from '../types/config'
import { applyEndpointAuth } from './middleware'

/**
 * Find permission (grant or deny) and determine its context
 * This helper is used to enrich endpoint hooks with resource context
 */
export async function findPermissionContext(
  adapter: Adapter,
  permissionId: string,
  type: 'grant' | 'deny'
): Promise<ResourceContext | null> {
  if (type === 'grant') {
    const grant = await adapter.findOne({
      model: 'permissionGrant',
      where: [{ field: 'id', value: permissionId }],
    }).catch(() => null) as PermissionGrant | null

    if (grant) {
      return {
        contextType: grant.contextType,
        contextId: grant.contextId,
        data: grant,
      }
    }
  } else {
    const deny = await adapter.findOne({
      model: 'permissionDeny',
      where: [{ field: 'id', value: permissionId }],
    }).catch(() => null) as PermissionDeny | null

    if (deny) {
      return {
        contextType: deny.contextType,
        contextId: deny.contextId,
        data: deny,
      }
    }
  }

  return null
}

export interface GrantPermissionInput {
  userId: string
  statementId: StatementId
  contextType: ContextType
  contextId: string
  expiresAt?: Date
  grantedBy: string
}

export interface DenyPermissionInput {
  userId: string
  statementId: StatementId
  contextType: ContextType
  contextId: string
  deniedBy: string
}

export interface RevokePermissionInput {
  permissionId: string
  type: 'grant' | 'deny'
  revokedBy: string
}

export interface CheckPermissionInput {
  userId: string
  statementId: StatementId
  contextType: ContextType
  contextId: string
}

export const permissionEndpoints = (config?: TenancyConfig) => ({
  grantPermission: createAuthEndpoint(
    '/tenancy/permission/grant',
    {
      method: 'POST',
      body: z.object({
        userId: z.string(),
        statementId: z.string(),
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
        expiresAt: z.string().optional(),
        grantedBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Grant permission',
          description: 'Grant explicit permission to a user',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.permission?.grant, ctx)

      const { userId, statementId, contextType, contextId, expiresAt, grantedBy } = ctx.body

      // Check if deny exists (deny always wins)
      const denies = await ctx.context.adapter.findMany({
        model: 'permissionDeny',
        where: [
          { field: 'userId', value: userId },
          { field: 'statementId', value: statementId },
          { field: 'contextType', value: contextType },
          { field: 'contextId', value: contextId },
        ],
      }) as PermissionDeny[]

      if (denies.length > 0) {
        throw new APIError('BAD_REQUEST', {
          message: `Cannot grant permission "${statementId}" because there is an active deny for this user in this context`,
        })
      }

      // Check if grant already exists
      const existingGrants = await ctx.context.adapter.findMany({
        model: 'permissionGrant',
        where: [
          { field: 'userId', value: userId },
          { field: 'statementId', value: statementId },
          { field: 'contextType', value: contextType },
          { field: 'contextId', value: contextId },
        ],
      }) as PermissionGrant[]

      if (existingGrants.length > 0) {
        throw new APIError('BAD_REQUEST', {
          message: `Permission grant already exists for statement "${statementId}" in this context`,
        })
      }

      const grant = await ctx.context.adapter.create({
        model: 'permissionGrant',
        data: {
          userId,
          statementId,
          contextType,
          contextId,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          grantedBy,
        },
      }) as PermissionGrant

      if (config?.audit?.onPermissionGranted) {
        await config.audit.onPermissionGranted({
          userId,
          statementId,
          contextType,
          contextId,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          grantedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(grant, { status: 201 })
    }
  ),

  denyPermission: createAuthEndpoint(
    '/tenancy/permission/deny',
    {
      method: 'POST',
      body: z.object({
        userId: z.string(),
        statementId: z.string(),
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
        deniedBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Deny permission',
          description: 'Deny explicit permission to a user',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.permission?.deny, ctx)

      const { userId, statementId, contextType, contextId, deniedBy } = ctx.body

      // Check if deny already exists
      const existingDenies = await ctx.context.adapter.findMany({
        model: 'permissionDeny',
        where: [
          { field: 'userId', value: userId },
          { field: 'statementId', value: statementId },
          { field: 'contextType', value: contextType },
          { field: 'contextId', value: contextId },
        ],
      }) as PermissionDeny[]

      if (existingDenies.length > 0) {
        throw new APIError('BAD_REQUEST', {
          message: `Permission deny already exists for statement "${statementId}" in this context`,
        })
      }

      const deny = await ctx.context.adapter.create({
        model: 'permissionDeny',
        data: {
          userId,
          statementId,
          contextType,
          contextId,
          deniedBy,
        },
      }) as PermissionDeny

      if (config?.audit?.onPermissionDenied) {
        await config.audit.onPermissionDenied({
          userId,
          statementId,
          contextType,
          contextId,
          deniedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(deny, { status: 201 })
    }
  ),

  revokePermission: createAuthEndpoint(
    '/tenancy/permission/revoke',
    {
      method: 'POST',
      body: z.object({
        permissionId: z.string(),
        type: z.enum(['grant', 'deny']),
        revokedBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Revoke permission',
          description: 'Revoke a grant or deny',
        },
      },
    },
    async (ctx) => {
      const { permissionId, type, revokedBy } = ctx.body

      // Find permission and enrich context BEFORE calling hook
      const resource = await findPermissionContext(ctx.context.adapter, permissionId, type)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: `${type === 'grant' ? 'Grant' : 'Deny'} with id "${permissionId}" not found` })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.permission?.revoke, {
        ...ctx,
        resource,
      })

      const permission = resource.data as PermissionGrant | PermissionDeny
      const modelName = type === 'grant' ? 'permissionGrant' : 'permissionDeny'

      await ctx.context.adapter.delete({
        model: modelName,
        where: [{ field: 'id', value: permissionId }],
      })

      if (config?.audit?.onPermissionRevoked) {
        await config.audit.onPermissionRevoked({
          type,
          permissionId,
          userId: permission.userId,
          statementId: permission.statementId,
          contextType: resource.contextType,
          contextId: resource.contextId,
          revokedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(null, { status: 204 })
    }
  ),

  checkPermission: createAuthEndpoint(
    '/tenancy/permission/check',
    {
      method: 'POST',
      body: z.object({
        userId: z.string(),
        statementId: z.string(),
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Check permission',
          description: 'Check if user has permission',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.permission?.check, ctx)

      const { userId, statementId, contextType, contextId } = ctx.body

      // 1. Check deny (highest priority)
      const denies = await ctx.context.adapter.findMany({
        model: 'permissionDeny',
        where: [
          { field: 'userId', value: userId },
          { field: 'statementId', value: statementId },
          { field: 'contextType', value: contextType },
          { field: 'contextId', value: contextId },
        ],
      }) as PermissionDeny[]

      if (denies.length > 0) {
        return ctx.json({
          allowed: false,
          reason: 'Explicit deny',
          details: { source: 'deny' },
        })
      }

      // 2. Check grant (second priority)
      const grants = await ctx.context.adapter.findMany({
        model: 'permissionGrant',
        where: [
          { field: 'userId', value: userId },
          { field: 'statementId', value: statementId },
          { field: 'contextType', value: contextType },
          { field: 'contextId', value: contextId },
        ],
      }) as PermissionGrant[]

      if (grants.length > 0) {
        const grant = grants[0]
        if (!grant) {
          return ctx.json({
            allowed: false,
            reason: 'No permission found',
            details: { source: 'none' },
          })
        }
        // Check expiration
        if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
          return ctx.json({
            allowed: false,
            reason: 'Grant expired',
            details: { source: 'grant', expired: true },
          })
        }
        return ctx.json({
          allowed: true,
          reason: 'Explicit grant',
          details: { source: 'grant' },
        })
      }

      // 3. Check role (third priority)
      let member: any = null
      let statementModel: 'organizationRoleStatement' | 'teamRoleStatement' | null = null

      if (contextType === 'organization') {
        const members = await ctx.context.adapter.findMany({
          model: 'organizationMember',
          where: [
            { field: 'userId', value: userId },
            { field: 'organizationId', value: contextId },
          ],
        }) as any[]
        member = members[0]
        statementModel = 'organizationRoleStatement'
      } else if (contextType === 'team') {
        const members = await ctx.context.adapter.findMany({
          model: 'teamMember',
          where: [
            { field: 'userId', value: userId },
            { field: 'teamId', value: contextId },
          ],
        }) as any[]
        member = members[0]
        statementModel = 'teamRoleStatement'
      } else if (contextType === 'subteam') {
        const members = await ctx.context.adapter.findMany({
          model: 'subteamMember',
          where: [
            { field: 'userId', value: userId },
            { field: 'subteamId', value: contextId },
          ],
        }) as any[]
        member = members[0]
      }

      if (member && member.roleId && statementModel) {
        const roleStatements = await ctx.context.adapter.findMany({
          model: statementModel,
          where: [{ field: 'roleId', value: member.roleId }],
        }) as any[]
        const statementIds = roleStatements.map((rs: any) => rs.statementId)
        if (statementIds.includes(statementId)) {
          return ctx.json({
            allowed: true,
            reason: 'Role permission',
            details: { source: 'role', roleId: member.roleId },
          })
        }
      }

      // 4. Check parent context (hierarchy inheritance)
      let parent: { type: ContextType; id: string } | null = null

      if (contextType === 'subteam') {
        const subteam = await ctx.context.adapter.findOne({
          model: 'subteam',
          where: [{ field: 'id', value: contextId }],
        }) as any
        if (subteam) {
          parent = { type: 'team', id: subteam.teamId }
        }
      } else if (contextType === 'team') {
        const team = await ctx.context.adapter.findOne({
          model: 'team',
          where: [{ field: 'id', value: contextId }],
        }) as any
        if (team) {
          parent = { type: 'organization', id: team.organizationId }
        }
      }

      if (parent) {
        return _checkPermission(ctx.context.adapter, {
          userId,
          statementId,
          contextType: parent.type,
          contextId: parent.id,
        }, config)
      }

      // No permission found
      return ctx.json({
        allowed: false,
        reason: 'No permission found',
        details: { source: 'none' },
      })
    }
  ),

  listGrants: createAuthEndpoint(
    '/tenancy/permission/grants',
    {
      method: 'GET',
      query: z.object({
        userId: z.string(),
        contextType: z.enum(['organization', 'team', 'subteam']).optional(),
        contextId: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List grants',
          description: 'List all grants for a user',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.permission?.listGrants, ctx, session)

      const { userId, contextType, contextId } = ctx.query

      const where: Array<{ field: string; value: string }> = [{ field: 'userId', value: userId }]
      if (contextType) {
        where.push({ field: 'contextType', value: contextType })
      }
      if (contextId) {
        where.push({ field: 'contextId', value: contextId })
      }

      const grants = await ctx.context.adapter.findMany({
        model: 'permissionGrant',
        where,
      }) as PermissionGrant[]

      return ctx.json(grants)
    }
  ),

  listDenies: createAuthEndpoint(
    '/tenancy/permission/denies',
    {
      method: 'GET',
      query: z.object({
        userId: z.string(),
        contextType: z.enum(['organization', 'team', 'subteam']).optional(),
        contextId: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List denies',
          description: 'List all denies for a user',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.permission?.listDenies, ctx, session)

      const { userId, contextType, contextId } = ctx.query

      const where: Array<{ field: string; value: string }> = [{ field: 'userId', value: userId }]
      if (contextType) {
        where.push({ field: 'contextType', value: contextType })
      }
      if (contextId) {
        where.push({ field: 'contextId', value: contextId })
      }

      const denies = await ctx.context.adapter.findMany({
        model: 'permissionDeny',
        where,
      }) as PermissionDeny[]

      return ctx.json(denies)
    }
  ),

  grantBatch: createAuthEndpoint(
    '/tenancy/permission/grant-batch',
    {
      method: 'POST',
      body: z.object({
        grants: z.array(z.object({
          userId: z.string(),
          statementId: z.string(),
          contextType: z.enum(['organization', 'team', 'subteam']),
          contextId: z.string(),
          expiresAt: z.string().optional(),
        })),
        grantedBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Batch grant permissions',
          description: 'Grant multiple permissions at once',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.permission?.grantBatch, ctx)

      const { grants, grantedBy } = ctx.body
      const successful: PermissionGrant[] = []
      const failed: Array<{ input: any; error: string }> = []

      for (const grantInput of grants) {
        try {
          // Check if deny exists
          const denies = await ctx.context.adapter.findMany({
            model: 'permissionDeny',
            where: [
              { field: 'userId', value: grantInput.userId },
              { field: 'statementId', value: grantInput.statementId },
              { field: 'contextType', value: grantInput.contextType },
              { field: 'contextId', value: grantInput.contextId },
            ],
          }) as PermissionDeny[]

          if (denies.length > 0) {
            failed.push({
              input: grantInput,
              error: `Cannot grant permission because there is an active deny`,
            })
            continue
          }

          // Check if grant already exists
          const existingGrants = await ctx.context.adapter.findMany({
            model: 'permissionGrant',
            where: [
              { field: 'userId', value: grantInput.userId },
              { field: 'statementId', value: grantInput.statementId },
              { field: 'contextType', value: grantInput.contextType },
              { field: 'contextId', value: grantInput.contextId },
            ],
          }) as PermissionGrant[]

          if (existingGrants.length > 0) {
            failed.push({
              input: grantInput,
              error: 'Permission grant already exists',
            })
            continue
          }

          const grant = await ctx.context.adapter.create({
            model: 'permissionGrant',
            data: {
              userId: grantInput.userId,
              statementId: grantInput.statementId,
              contextType: grantInput.contextType,
              contextId: grantInput.contextId,
              expiresAt: grantInput.expiresAt ? new Date(grantInput.expiresAt) : null,
              grantedBy,
            },
          }) as PermissionGrant

          if (config?.audit?.onPermissionGranted) {
            await config.audit.onPermissionGranted({
              userId: grantInput.userId,
              statementId: grantInput.statementId,
              contextType: grantInput.contextType,
              contextId: grantInput.contextId,
              expiresAt: grantInput.expiresAt ? new Date(grantInput.expiresAt) : undefined,
              grantedBy,
              timestamp: new Date(),
            })
          }

          successful.push(grant)
        } catch (error) {
          failed.push({
            input: grantInput,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      return ctx.json({ successful, failed })
    }
  ),

  denyBatch: createAuthEndpoint(
    '/tenancy/permission/deny-batch',
    {
      method: 'POST',
      body: z.object({
        denies: z.array(z.object({
          userId: z.string(),
          statementId: z.string(),
          contextType: z.enum(['organization', 'team', 'subteam']),
          contextId: z.string(),
        })),
        deniedBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Batch deny permissions',
          description: 'Deny multiple permissions at once',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.permission?.denyBatch, ctx)

      const { denies, deniedBy } = ctx.body
      const successful: PermissionDeny[] = []
      const failed: Array<{ input: any; error: string }> = []

      for (const denyInput of denies) {
        try {
          // Check if deny already exists
          const existingDenies = await ctx.context.adapter.findMany({
            model: 'permissionDeny',
            where: [
              { field: 'userId', value: denyInput.userId },
              { field: 'statementId', value: denyInput.statementId },
              { field: 'contextType', value: denyInput.contextType },
              { field: 'contextId', value: denyInput.contextId },
            ],
          }) as PermissionDeny[]

          if (existingDenies.length > 0) {
            failed.push({
              input: denyInput,
              error: 'Permission deny already exists',
            })
            continue
          }

          const deny = await ctx.context.adapter.create({
            model: 'permissionDeny',
            data: {
              userId: denyInput.userId,
              statementId: denyInput.statementId,
              contextType: denyInput.contextType,
              contextId: denyInput.contextId,
              deniedBy,
            },
          }) as PermissionDeny

          if (config?.audit?.onPermissionDenied) {
            await config.audit.onPermissionDenied({
              userId: denyInput.userId,
              statementId: denyInput.statementId,
              contextType: denyInput.contextType,
              contextId: denyInput.contextId,
              deniedBy,
              timestamp: new Date(),
            })
          }

          successful.push(deny)
        } catch (error) {
          failed.push({
            input: denyInput,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      return ctx.json({ successful, failed })
    }
  ),
})

// Helper function for recursive permission checking
async function _checkPermission(
  adapter: Adapter,
  input: CheckPermissionInput,
  config?: TenancyConfig
): Promise<any> {
  // 1. Check deny
  const denies = await adapter.findMany({
    model: 'permissionDeny',
    where: [
      { field: 'userId', value: input.userId },
      { field: 'statementId', value: input.statementId },
      { field: 'contextType', value: input.contextType },
      { field: 'contextId', value: input.contextId },
    ],
  }) as PermissionDeny[]

  if (denies.length > 0) {
    return {
      allowed: false,
      reason: 'Explicit deny',
      details: { source: 'deny' },
    }
  }

  // 2. Check grant
  const grants = await adapter.findMany({
    model: 'permissionGrant',
    where: [
      { field: 'userId', value: input.userId },
      { field: 'statementId', value: input.statementId },
      { field: 'contextType', value: input.contextType },
      { field: 'contextId', value: input.contextId },
    ],
  }) as PermissionGrant[]

  if (grants.length > 0) {
    const grant = grants[0]!
    if (grant.expiresAt && new Date(grant.expiresAt) < new Date()) {
      return {
        allowed: false,
        reason: 'Grant expired',
        details: { source: 'grant', expired: true },
      }
    }
    return {
      allowed: true,
      reason: 'Explicit grant',
      details: { source: 'grant' },
    }
  }

  // 3. Check role
  let member: any = null
  let statementModel: 'organizationRoleStatement' | 'teamRoleStatement' | null = null

  if (input.contextType === 'organization') {
    const members = await adapter.findMany({
      model: 'organizationMember',
      where: [
        { field: 'userId', value: input.userId },
        { field: 'organizationId', value: input.contextId },
      ],
    }) as any[]
    member = members[0]
    statementModel = 'organizationRoleStatement'
  } else if (input.contextType === 'team') {
    const members = await adapter.findMany({
      model: 'teamMember',
      where: [
        { field: 'userId', value: input.userId },
        { field: 'teamId', value: input.contextId },
      ],
    }) as any[]
    member = members[0]
    statementModel = 'teamRoleStatement'
  } else if (input.contextType === 'subteam') {
    const members = await adapter.findMany({
      model: 'subteamMember',
      where: [
        { field: 'userId', value: input.userId },
        { field: 'subteamId', value: input.contextId },
      ],
    }) as any[]
    member = members[0]
  }

  if (member && member.roleId && statementModel) {
    const roleStatements = await adapter.findMany({
      model: statementModel,
      where: [{ field: 'roleId', value: member.roleId }],
    }) as any[]
    const statementIds = roleStatements.map((rs: any) => rs.statementId)
    if (statementIds.includes(input.statementId)) {
      return {
        allowed: true,
        reason: 'Role permission',
        details: { source: 'role', roleId: member.roleId },
      }
    }
  }

  // 4. Check parent context
  let parent: { type: ContextType; id: string } | null = null

  if (input.contextType === 'subteam') {
    const subteam = await adapter.findOne({
      model: 'subteam',
      where: [{ field: 'id', value: input.contextId }],
    }) as any
    if (subteam) {
      parent = { type: 'team', id: subteam.teamId }
    }
  } else if (input.contextType === 'team') {
    const team = await adapter.findOne({
      model: 'team',
      where: [{ field: 'id', value: input.contextId }],
    }) as any
    if (team) {
      parent = { type: 'organization', id: team.organizationId }
    }
  }

  if (parent) {
    return _checkPermission(adapter, {
      userId: input.userId,
      statementId: input.statementId,
      contextType: parent.type,
      contextId: parent.id,
    }, config)
  }

  return {
    allowed: false,
    reason: 'No permission found',
    details: { source: 'none' },
  }
}

// Helper function for cleaning up permissions (used by other modules)
export async function cleanupContextPermissions(
  adapter: Adapter,
  contextType: ContextType,
  contextId: string
): Promise<{ grantsDeleted: number; deniesDeleted: number }> {
  // Get all grants for this context
  const grants = await adapter.findMany({
    model: 'permissionGrant',
    where: [
      { field: 'contextType', value: contextType },
      { field: 'contextId', value: contextId },
    ],
  }) as PermissionGrant[]

  // Delete them
  for (const grant of grants) {
    await adapter.delete({
      model: 'permissionGrant',
      where: [{ field: 'id', value: grant.id }],
    })
  }

  // Get all denies for this context
  const denies = await adapter.findMany({
    model: 'permissionDeny',
    where: [
      { field: 'contextType', value: contextType },
      { field: 'contextId', value: contextId },
    ],
  }) as PermissionDeny[]

  // Delete them
  for (const deny of denies) {
    await adapter.delete({
      model: 'permissionDeny',
      where: [{ field: 'id', value: deny.id }],
    })
  }

  return { grantsDeleted: grants.length, deniesDeleted: denies.length }
}
