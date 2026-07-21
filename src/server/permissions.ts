import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { PermissionGrant, PermissionDeny } from '../schema'
import type { ContextType } from '../types/context'
import type { StatementId } from '../types/statement'
import type { TenancyConfig, ResourceContext } from '../types/config'
import { applyEndpointAuth, requireSession } from './middleware'
import {
  ok, created, noContent, okArray, okBatch,
  permissionGrantSchema, permissionDenySchema, permissionCheckSchema, permissionContextSchema,
} from './openapi'

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
}

export interface DenyPermissionInput {
  userId: string
  statementId: StatementId
  contextType: ContextType
  contextId: string
}

export interface RevokePermissionInput {
  permissionId: string
  type: 'grant' | 'deny'
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
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
        expiresAt: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Grant permission',
          description: 'Grant explicit permission to a user (requires authentication)',
          responses: created(permissionGrantSchema, 'Permission granted'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const grantedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.permission?.grant, ctx, session)

      const { userId, statementId, contextType, contextId, expiresAt } = ctx.body

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
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Deny permission',
          description: 'Deny explicit permission to a user (requires authentication)',
          responses: created(permissionDenySchema, 'Permission denied'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deniedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.permission?.deny, ctx, session)

      const { userId, statementId, contextType, contextId } = ctx.body

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
      }),
      metadata: {
        openapi: {
          summary: 'Revoke permission',
          description: 'Revoke a grant or deny (requires authentication)',
          responses: noContent('Permission revoked'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const revokedBy = session.user.id

      const { permissionId, type } = ctx.body

      const resource = await findPermissionContext(ctx.context.adapter, permissionId, type)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: `${type === 'grant' ? 'Grant' : 'Deny'} with id "${permissionId}" not found` })
      }

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
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Check permission',
          description: 'Check if user has permission',
          responses: ok(permissionCheckSchema, 'Permission evaluation result'),
        },
      },
    },
    async (ctx) => {
      await applyEndpointAuth(config?.endpoints?.permission?.check, ctx)

      const { userId, statementId, contextType, contextId } = ctx.body

      const result = await resolvePermission(ctx.context.adapter, {
        userId,
        statementId: statementId as StatementId,
        contextType,
        contextId,
      }, config)

      return ctx.json(result)
    }
  ),

  listGrants: createAuthEndpoint(
    '/tenancy/permission/grants',
    {
      method: 'GET',
      query: z.object({
        userId: z.string(),
        contextType: z.enum(['organization', 'team']).optional(),
        contextId: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List grants',
          description: 'List all grants for a user',
          responses: okArray(permissionGrantSchema, 'The user\'s grants'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
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
        contextType: z.enum(['organization', 'team']).optional(),
        contextId: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List denies',
          description: 'List all denies for a user',
          responses: okArray(permissionDenySchema, 'The user\'s denies'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
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

  listPermissionContexts: createAuthEndpoint(
    '/tenancy/permission/contexts',
    {
      method: 'GET',
      query: z.object({
        // If provided, only return contexts where this permission resolves to allowed
        statementId: z.string().optional(),
        // Optional scope filters
        contextType: z.enum(['organization', 'team']).optional(),
        contextId: z.string().optional(),
        // With contextType+contextId+statementId: also return descendant teams of that
        // scope that resolve to allowed (inherited from the scope or with their own grant).
        includeDescendants: z.coerce.boolean().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List permission contexts',
          description:
            'List the contexts (organizations/teams) the authenticated user has access to, with their hierarchy (parentType/parentId) and resolved root organizationId.',
          responses: ok(
            {
              type: 'object',
              properties: { contexts: { type: 'array', items: permissionContextSchema } },
              required: ['contexts'],
            },
            'Contexts the user has access to',
          ),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const { statementId, contextType, contextId, includeDescendants } = ctx.query
      const userId = session.user.id

      // Gather distinct contexts the user relates to directly: memberships + grants
      const [members, grants] = await Promise.all([
        ctx.context.adapter.findMany({
          model: 'member',
          where: [{ field: 'userId', value: userId }],
        }) as Promise<any[]>,
        ctx.context.adapter.findMany({
          model: 'permissionGrant',
          where: [{ field: 'userId', value: userId }],
        }) as Promise<PermissionGrant[]>,
      ])

      type ContextSource = 'role' | 'membership' | 'grant' | 'inherited'
      const seen = new Map<string, { contextType: ContextType; contextId: string; source: ContextSource; roleId?: string }>()
      for (const m of members) {
        seen.set(`${m.contextType}:${m.contextId}`, {
          contextType: m.contextType,
          contextId: m.contextId,
          // A bare membership (no role) confers no role-derived permissions
          source: m.roleId ? 'role' : 'membership',
          roleId: m.roleId ?? undefined,
        })
      }
      const now = new Date()
      for (const g of grants) {
        // Skip expired grants: they confer no access (matches _checkPermission)
        if (g.expiresAt && new Date(g.expiresAt) < now) continue
        const key = `${g.contextType}:${g.contextId}`
        if (!seen.has(key)) {
          seen.set(key, { contextType: g.contextType, contextId: g.contextId, source: 'grant' })
        }
      }

      // Optional scope filters
      let entries = [...seen.values()]
      if (contextType) entries = entries.filter((e) => e.contextType === contextType)
      if (contextId) entries = entries.filter((e) => e.contextId === contextId)

      // Targeting an exact context with a permission check: access may be inherited
      // from a parent context, so it won't appear in the direct (membership/grant) set.
      // Add it as a candidate; the statementId check below decides if it's actually allowed.
      if (statementId && contextType && contextId && !seen.has(`${contextType}:${contextId}`)) {
        entries.push({ contextType, contextId, source: 'inherited' })
      }

      // includeDescendants: expand the scope to its whole team subtree, so the caller
      // gets every descendant that resolves to allowed (inherited from the scope or its own
      // grant). Only meaningful as a permission-scoped query (needs contextType+contextId+statementId).
      if (includeDescendants && statementId && contextType && contextId) {
        // BFS over parentId, matching (parentType:parentId) to guard against id collisions/cycles.
        let frontier = new Set([`${contextType}:${contextId}`])
        const visited = new Set(frontier)
        for (let depth = 0; frontier.size && depth < 100; depth++) {
          const frontierIds = [...frontier].map((k) => k.slice(k.indexOf(':') + 1))
          const children = await ctx.context.adapter.findMany({
            model: 'team',
            where: [{ field: 'parentId', operator: 'in', value: frontierIds }],
          }) as any[]
          const next = new Set<string>()
          for (const c of children) {
            if (!frontier.has(`${c.parentType}:${c.parentId}`)) continue
            const key = `team:${c.id}`
            if (visited.has(key)) continue
            visited.add(key)
            next.add(key)
            // Preserve a direct source/roleId if the user already relates to this team
            entries.push(seen.get(key) ?? { contextType: 'team', contextId: c.id, source: 'inherited' })
          }
          frontier = next
        }
      }

      // Optional filter: keep only contexts where the given permission resolves to allowed
      // ponytail: O(entries × chain-depth) — each resolve re-climbs the parent chain
      // this walk already traversed. Fine at current scale (short chains, resolves
      // usually short-circuit at/near the entry). Upgrade path if it bites: thread
      // the already-loaded ancestor map into resolvePermission instead of re-querying.
      if (statementId) {
        const results = await Promise.all(entries.map((entry) =>
          _checkPermission(ctx.context.adapter, {
            userId,
            statementId,
            contextType: entry.contextType,
            contextId: entry.contextId,
          }, config)
        ))
        entries = entries.filter((_, i) => results[i]!.allowed)
      }

      // Batch-fetch names + hierarchy: one query per model instead of one per context
      const orgIds = entries.filter((e) => e.contextType === 'organization').map((e) => e.contextId)
      const teamIds = entries.filter((e) => e.contextType === 'team').map((e) => e.contextId)
      const [orgs, teams] = await Promise.all([
        orgIds.length
          ? ctx.context.adapter.findMany({ model: 'organization', where: [{ field: 'id', operator: 'in', value: orgIds }] }) as Promise<any[]>
          : Promise.resolve([]),
        teamIds.length
          ? ctx.context.adapter.findMany({ model: 'team', where: [{ field: 'id', operator: 'in', value: teamIds }] }) as Promise<any[]>
          : Promise.resolve([]),
      ])
      const orgById = new Map(orgs.map((o) => [o.id, o]))
      const teamById = new Map<string, any>(teams.map((t) => [t.id, t]))

      // Load ancestor teams so we can resolve each team's root organization.
      // The direct-referenced teams may sit deep in a team->team->...->org chain.
      for (let depth = 0; depth < 100; depth++) {
        const missing = [...teamById.values()]
          .filter((t) => t.parentType === 'team' && t.parentId && !teamById.has(t.parentId))
          .map((t) => t.parentId as string)
        if (!missing.length) break
        const parents = await ctx.context.adapter.findMany({
          model: 'team',
          where: [{ field: 'id', operator: 'in', value: [...new Set(missing)] }],
        }) as any[]
        if (!parents.length) break
        for (const p of parents) teamById.set(p.id, p)
      }

      // Walk up a team's parent chain to its root organization id (self if already an org).
      const resolveOrgId = (type: ContextType, id: string): string | null => {
        if (type === 'organization') return id
        let team = teamById.get(id)
        for (let depth = 0; team && depth < 100; depth++) {
          if (team.parentType === 'organization') return team.parentId ?? null
          team = team.parentType === 'team' ? teamById.get(team.parentId) : undefined
        }
        return null
      }

      const contexts: Array<{
        contextType: ContextType
        contextId: string
        name: string
        parentType: ContextType | null
        parentId: string | null
        organizationId: string
        source: ContextSource
        roleId?: string
      }> = []

      for (const entry of entries) {
        const record = entry.contextType === 'organization'
          ? orgById.get(entry.contextId)
          : teamById.get(entry.contextId)
        if (!record) continue
        const organizationId = resolveOrgId(entry.contextType, entry.contextId)
        if (!organizationId) continue
        contexts.push({
          ...entry,
          name: record.name,
          parentType: record.parentType ?? null,
          parentId: record.parentId ?? null,
          organizationId,
        })
      }

      return ctx.json({ contexts })
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
          contextType: z.enum(['organization', 'team']),
          contextId: z.string(),
          expiresAt: z.string().optional(),
        })),
      }),
      metadata: {
        openapi: {
          summary: 'Batch grant permissions',
          description: 'Grant multiple permissions at once (requires authentication)',
          responses: okBatch(permissionGrantSchema, 'Batch grant result'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const grantedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.permission?.grantBatch, ctx, session)

      const { grants } = ctx.body
      const successful: PermissionGrant[] = []
      const failed: Array<{ input: any; error: string }> = []

      for (const grantInput of grants) {
        try {
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
          contextType: z.enum(['organization', 'team']),
          contextId: z.string(),
        })),
      }),
      metadata: {
        openapi: {
          summary: 'Batch deny permissions',
          description: 'Deny multiple permissions at once (requires authentication)',
          responses: okBatch(permissionDenySchema, 'Batch deny result'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deniedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.permission?.denyBatch, ctx, session)

      const { denies } = ctx.body
      const successful: PermissionDeny[] = []
      const failed: Array<{ input: any; error: string }> = []

      for (const denyInput of denies) {
        try {
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

export interface ResolvePermissionResult {
  allowed: boolean
  reason: string
  details: Record<string, any>
}

/**
 * Public permission resolver. Single source of truth for authorization:
 * deny > grant > role > parent context (recursive up the hierarchy).
 *
 * Reuse this in endpoint/filtering hooks instead of reimplementing the
 * resolution by hand — hand copies drift and only resolve grants.
 */
export async function resolvePermission(
  adapter: Adapter,
  input: CheckPermissionInput,
  config?: TenancyConfig,
  // ponytail: visited set guards cyclic/self-referential parentId chains
  visited: Set<string> = new Set()
): Promise<ResolvePermissionResult> {
  const key = `${input.contextType}:${input.contextId}`
  if (visited.has(key)) {
    return { allowed: false, reason: 'No permission found', details: { source: 'none', cycle: true } }
  }
  visited.add(key)

  // 1. Check deny — always wins, never climbs
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
    return { allowed: false, reason: 'Explicit deny', details: { source: 'deny' } }
  }

  // 2. Check grant — any non-expired grant among the rows counts; an
  // expired grant must NOT short-circuit the role/parent fallback.
  const grants = await adapter.findMany({
    model: 'permissionGrant',
    where: [
      { field: 'userId', value: input.userId },
      { field: 'statementId', value: input.statementId },
      { field: 'contextType', value: input.contextType },
      { field: 'contextId', value: input.contextId },
    ],
  }) as PermissionGrant[]

  const now = new Date()
  let sawExpiredGrant = false
  const hasValidGrant = grants.some(g => {
    const valid = !g.expiresAt || new Date(g.expiresAt) >= now
    if (!valid) sawExpiredGrant = true
    return valid
  })
  if (hasValidGrant) {
    return { allowed: true, reason: 'Explicit grant', details: { source: 'grant' } }
  }

  // 3. Check role
  const members = await adapter.findMany({
    model: 'member',
    where: [
      { field: 'userId', value: input.userId },
      { field: 'contextType', value: input.contextType },
      { field: 'contextId', value: input.contextId },
    ],
  }) as any[]
  const member = members[0]

  if (member && member.roleId) {
    const roleStatements = await adapter.findMany({
      model: 'roleStatement',
      where: [{ field: 'roleId', value: member.roleId }],
    }) as any[]
    const statementIds = roleStatements.map((rs: any) => rs.statementId)
    if (statementIds.includes(input.statementId)) {
      return { allowed: true, reason: 'Role permission', details: { source: 'role', roleId: member.roleId } }
    }
  }

  // 4. Check parent context
  let parent: { type: ContextType; id: string } | null = null

  if (input.contextType === 'team') {
    const team = await adapter.findOne({
      model: 'team',
      where: [{ field: 'id', value: input.contextId }],
    }) as any
    if (team) {
      parent = { type: team.parentType, id: team.parentId }
    }
  }

  const result: ResolvePermissionResult = parent
    ? await resolvePermission(adapter, {
        userId: input.userId,
        statementId: input.statementId,
        contextType: parent.type,
        contextId: parent.id,
      }, config, visited)
    : { allowed: false, reason: 'No permission found', details: { source: 'none' } }

  // Preserve the "an expired grant existed here" signal so clients can still
  // prompt to renew it, even though the expired grant no longer denies access.
  if (!result.allowed && result.details.source === 'none' && sawExpiredGrant) {
    result.details.expired = true
  }
  return result
}

// Internal alias kept for existing call sites
const _checkPermission = resolvePermission

/**
 * Reusable authorization hook: assert the current user holds `statementId`
 * in the request's context, throwing APIError('FORBIDDEN') otherwise.
 *
 * Drop into config as an endpoint auth hook so consumers stop hand-rolling
 * resolution per endpoint. contextType/contextId are read from the request
 * (body → query → params); the user comes from the session.
 *
 * @example
 * tenancy({ endpoints: { team: { create: requirePermission('team:create') } } })
 */
export function requirePermission(statementId: StatementId) {
  return async ({ ctx, session }: { ctx: any; session?: any }): Promise<void> => {
    const s = session ?? await requireSession(ctx)
    // URL params win over caller-controlled body/query: the endpoint acts on
    // the params-keyed resource, so authorize against that, not a spoofable body.
    const src = { ...ctx.body, ...ctx.query, ...ctx.params }
    const contextType = src.contextType as ContextType
    const contextId = src.contextId as string

    if (!contextType || !contextId) {
      throw new APIError('BAD_REQUEST', {
        message: 'contextType and contextId are required to authorize this request.',
      })
    }

    const { allowed } = await resolvePermission(ctx.context.adapter, {
      userId: s.user.id,
      statementId,
      contextType,
      contextId,
    })

    if (!allowed) {
      throw new APIError('FORBIDDEN', {
        message: `Missing permission: ${statementId}`,
      })
    }
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
