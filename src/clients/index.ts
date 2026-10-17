/**
 * Better Auth Tenancy - Universal Client Plugin
 *
 * Works seamlessly in both web and React Native/Expo environments.
 * Provides type-safe methods to interact with the tenancy plugin endpoints.
 *
 * @example Web (with cookies)
 * ```typescript
 * import { createAuthClient } from 'better-auth/react'
 * import { tenancyClient } from '@zytera/better-auth-tenancy/client'
 *
 * const authClient = createAuthClient({
 *   baseURL: '/api/auth',
 *   plugins: [tenancyClient()]
 * })
 *
 * // Use the client
 * await authClient.tenancy.organization.create({ name: 'Acme', slug: 'acme' })
 * ```
 *
 * @example React Native/Expo (with Bearer tokens)
 * ```typescript
 * import { createAuthClient } from 'better-auth/react'
 * import { expoClient } from '@better-auth/expo/client'
 * import { tenancyClient } from '@zytera/better-auth-tenancy/client'
 *
 * const authClient = createAuthClient({
 *   baseURL: 'https://api.example.com',
 *   plugins: [
 *     expoClient(),
 *     tenancyClient({ locale: 'es' })
 *   ]
 * })
 * ```
 *
 * @packageDocumentation
 */

import type {BetterAuthClientPlugin} from 'better-auth/client'
import type {BetterFetchOption} from '@better-fetch/fetch'
import type { RoleTranslationInput } from '../types/role.js'

// Parameter types for `getActions`, derived from the plugin interface itself so
// they track whichever better-auth version is installed (the client must keep
// working from better-auth 1.0 up).
type GetActionsParams = Parameters<NonNullable<BetterAuthClientPlugin['getActions']>>

export interface TenancyClientConfig {
    /**
     * Preferred locale for i18n (e.g., 'en', 'es', 'fr')
     *
     * Sent as the `Accept-Language` header on every `/tenancy/*` request, so the
     * server picks the matching translations and error messages. Accepts a
     * static code or a getter evaluated per request, for i18n runtimes where
     * the active locale changes without a page reload (e.g. paraglide).
     */
    locale?: string | (() => string)
}

/**
 * Better Auth Tenancy Client Plugin
 *
 * Universal client plugin that works in both web and React Native/Expo environments.
 * All endpoints are exposed as clean, type-safe methods grouped by domain.
 *
 * @param config - Optional client configuration
 * @returns BetterAuthClientPlugin
 */
export function tenancyClient(config?: TenancyClientConfig) {
    const locale = config?.locale
    return {
        id: 'better-auth-tenancy' as const,

        getActions: (...[$fetch]: GetActionsParams) => ({
            tenancy: {
                organization: {
                    create: async (
                        data: { name: string; slug: string; metadata?: Record<string, unknown> },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/organization/create', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    get: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/organization/${data.id}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    getBySlug: async (
                        data: { slug: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/organization/by-slug/${data.slug}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    update: async (
                        data: { id: string; name?: string; slug?: string; metadata?: Record<string, unknown> },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/organization/update', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    delete: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/organization/delete', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    list: async (
                        data?: {
                            limit?: number;
                            offset?: number;
                            orderBy?: 'createdAt' | 'name';
                            orderDirection?: 'asc' | 'desc'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        if (data?.limit) params.set('limit', String(data.limit))
                        if (data?.offset) params.set('offset', String(data.offset))
                        if (data?.orderBy) params.set('orderBy', data.orderBy)
                        if (data?.orderDirection) params.set('orderDirection', data.orderDirection)

                        return await $fetch(`/tenancy/organization/list?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },
                },

                team: {
                    create: async (
                        data: {
                            parentType: 'organization' | 'team';
                            parentId: string;
                            name: string;
                            slug: string;
                            metadata?: Record<string, unknown>
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/team/create', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    get: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/team/${data.id}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    getBySlug: async (
                        data: { parentType: 'organization' | 'team'; parentId: string; slug: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/team/${data.parentType}/${data.parentId}/by-slug/${data.slug}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    update: async (
                        data: { id: string; name?: string; slug?: string; metadata?: Record<string, unknown> },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/team/update', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    delete: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/team/delete', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    list: async (
                        data: {
                            parentType: 'organization' | 'team';
                            parentId: string;
                            limit?: number;
                            offset?: number;
                            orderBy?: 'createdAt' | 'name';
                            orderDirection?: 'asc' | 'desc'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('parentType', data.parentType)
                        params.set('parentId', data.parentId)
                        if (data.limit) params.set('limit', String(data.limit))
                        if (data.offset) params.set('offset', String(data.offset))
                        if (data.orderBy) params.set('orderBy', data.orderBy)
                        if (data.orderDirection) params.set('orderDirection', data.orderDirection)

                        return await $fetch(`/tenancy/team/list?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },
                },

                statement: {
                    create: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/statement/create', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    get: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/statement/${data.id}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    update: async (
                        data: { id: string; category?: string; operation?: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/statement/update', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    delete: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/statement/delete', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    list: async (
                        data?: {
                            limit?: number;
                            offset?: number;
                            category?: string;
                            orderBy?: 'createdAt' | 'id';
                            orderDirection?: 'asc' | 'desc'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        if (data?.limit) params.set('limit', String(data.limit))
                        if (data?.offset) params.set('offset', String(data.offset))
                        if (data?.category) params.set('category', data.category)
                        if (data?.orderBy) params.set('orderBy', data.orderBy)
                        if (data?.orderDirection) params.set('orderDirection', data.orderDirection)

                        return await $fetch(`/tenancy/statement/list?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    batchCreate: async (
                        data: { statements: string[] },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/statement/batch-create', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },
                },

                role: {
                    create: async (
                        data: {
                            name: string;
                            contextType: 'organization' | 'team';
                            contextId: string;
                            statements?: string[];
                            description?: string
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/role/create', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    get: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/role/${data.id}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    update: async (
                        data: { id: string; name?: string; description?: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/role/update', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    delete: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/role/delete', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    list: async (
                        data: {
                            contextType: 'organization' | 'team';
                            contextId: string;
                            limit?: number;
                            offset?: number;
                            orderBy?: 'createdAt' | 'name';
                            orderDirection?: 'asc' | 'desc';
                            includeStatements?: boolean
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('contextType', data.contextType)
                        params.set('contextId', data.contextId)
                        if (data.limit) params.set('limit', String(data.limit))
                        if (data.offset) params.set('offset', String(data.offset))
                        if (data.orderBy) params.set('orderBy', data.orderBy)
                        if (data.orderDirection) params.set('orderDirection', data.orderDirection)
                        if (data.includeStatements !== undefined) params.set('includeStatements', String(data.includeStatements))

                        return await $fetch(`/tenancy/role/list?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    addStatement: async (
                        data: { id: string; statementId: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/role/statement/add', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    removeStatement: async (
                        data: { id: string; statementId: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/role/statement/remove', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },
                    setTranslations: async (
                        data: { id: string; translations: RoleTranslationInput[] },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/role/translations/set', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },
                },

                member: {
                    add: async (
                        data: {
                            userId: string;
                            contextType: 'organization' | 'team';
                            contextId: string;
                            roleId?: string;
                            metadata?: Record<string, unknown>
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/member/add', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    get: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/member/${data.id}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    updateRole: async (
                        data: { id: string; roleId: string; updatedBy: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/member/role/update', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    updateMetadata: async (
                        data: { id: string; metadata: Record<string, unknown>; updatedBy: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/member/metadata/update', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    remove: async (
                        data: { id: string; removedBy: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/member/remove', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    list: async (
                        data: {
                            contextType: 'organization' | 'team';
                            contextId: string;
                            limit?: number;
                            offset?: number;
                            orderBy?: 'createdAt' | 'addedAt';
                            orderDirection?: 'asc' | 'desc'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('contextType', data.contextType)
                        params.set('contextId', data.contextId)
                        if (data.limit) params.set('limit', String(data.limit))
                        if (data.offset) params.set('offset', String(data.offset))
                        if (data.orderBy) params.set('orderBy', data.orderBy)
                        if (data.orderDirection) params.set('orderDirection', data.orderDirection)

                        return await $fetch(`/tenancy/member/list?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    getUserMemberships: async (
                        data: {
                            userId: string;
                            contextType?: 'organization' | 'team';
                            limit?: number;
                            offset?: number
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('userId', data.userId)
                        if (data.contextType) params.set('contextType', data.contextType)
                        if (data.limit) params.set('limit', String(data.limit))
                        if (data.offset) params.set('offset', String(data.offset))

                        return await $fetch(`/tenancy/member/user/memberships?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    check: async (
                        data: { userId: string; contextType: 'organization' | 'team'; contextId: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/member/check', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },
                },

                permission: {
                    grant: async (
                        data: {
                            userId: string;
                            statementId: string;
                            contextType: 'organization' | 'team';
                            contextId: string;
                            expiresAt?: Date
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/permission/grant', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    deny: async (
                        data: {
                            userId: string;
                            statementId: string;
                            contextType: 'organization' | 'team';
                            contextId: string
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/permission/deny', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    revoke: async (
                        data: {
                            permissionId: string;
                            type: 'grant' | 'deny'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/permission/revoke', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    check: async (
                        data: {
                            userId: string;
                            statementId: string;
                            contextType: 'organization' | 'team';
                            contextId: string
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/permission/check', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    listGrants: async (
                        data: { userId: string; limit?: number; offset?: number },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('userId', data.userId)
                        if (data.limit) params.set('limit', String(data.limit))
                        if (data.offset) params.set('offset', String(data.offset))

                        return await $fetch(`/tenancy/permission/grants?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    listDenies: async (
                        data: { userId: string; limit?: number; offset?: number },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('userId', data.userId)
                        if (data.limit) params.set('limit', String(data.limit))
                        if (data.offset) params.set('offset', String(data.offset))

                        return await $fetch(`/tenancy/permission/denies?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    listPermissionContexts: async (
                        data: { statementId?: string; contextType?: 'organization' | 'team'; contextId?: string; includeDescendants?: boolean } = {},
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        if (data.statementId) params.set('statementId', data.statementId)
                        if (data.contextType) params.set('contextType', data.contextType)
                        if (data.contextId) params.set('contextId', data.contextId)
                        if (data.includeDescendants) params.set('includeDescendants', 'true')

                        return await $fetch(`/tenancy/permission/contexts?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    grantBatch: async (
                        data: {
                            grants: Array<{
                                userId: string;
                                statementId: string;
                                contextType: 'organization' | 'team';
                                contextId: string;
                                expiresAt?: Date
                            }>
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/permission/grant-batch', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    denyBatch: async (
                        data: {
                            denies: Array<{
                                userId: string;
                                statementId: string;
                                contextType: 'organization' | 'team';
                                contextId: string
                            }>
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/permission/deny-batch', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },
                },

                invitation: {
                    create: async (
                        data: {
                            identifier?: string;
                            contextType: 'organization' | 'team';
                            contextId: string;
                            roleId?: string;
                            expiresInHours?: number;
                            generateCode?: boolean;
                            metadata?: Record<string, unknown>
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/invitation/create', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    accept: async (
                        data: { token: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/invitation/accept', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    reject: async (
                        data: { token: string; userId: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/invitation/reject', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    cancel: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/invitation/cancel', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    getByToken: async (
                        data: { token: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/invitation/by-token/${data.token}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    getByCode: async (
                        data: { code: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/invitation/by-code/${data.code}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    list: async (
                        data: {
                            contextType: 'organization' | 'team';
                            contextId: string;
                            limit?: number;
                            offset?: number;
                            status?: 'pending' | 'accepted' | 'rejected' | 'canceled' | 'expired';
                            orderBy?: 'createdAt' | 'expiresAt';
                            orderDirection?: 'asc' | 'desc'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('contextType', data.contextType)
                        params.set('contextId', data.contextId)
                        if (data.limit) params.set('limit', String(data.limit))
                        if (data.offset) params.set('offset', String(data.offset))
                        if (data.status) params.set('status', data.status)
                        if (data.orderBy) params.set('orderBy', data.orderBy)
                        if (data.orderDirection) params.set('orderDirection', data.orderDirection)

                        return await $fetch(`/tenancy/invitation/list?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    getByIdentifier: async (
                        data: {
                            identifier: string;
                            status?: 'pending' | 'accepted' | 'rejected' | 'canceled' | 'expired';
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('identifier', data.identifier)
                        if (data.status) params.set('status', data.status)

                        return await $fetch(`/tenancy/invitation/by-identifier?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    cleanupExpired: async (
                        data?: Record<string, never>,
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/invitation/cleanup', {
                            method: 'POST',
                            body: data || {},
                            ...fetchOptions,
                        })
                    },
                },
            }
        }),

        // better-auth's client only consumes `getActions`, `getAtoms`, `pathMethods`,
        // `atomListeners` and `fetchPlugins` from client plugins: a top-level
        // `fetchOptions` here is silently ignored (verified against better-auth
        // 1.7.x, `getClientConfig` in `dist/client/config.mjs`). The header is
        // therefore applied through a better-fetch plugin, evaluated per request.
        // Scoped to `/tenancy/*` so the rest of the auth endpoints are untouched.
        //
        // NOTE: keep the return type of `tenancyClient` precise (this object
        // literal, no `BetterAuthClientPlugin` annotation): better-auth infers
        // the typed `authClient.tenancy.*` actions from this shape, and a plugin
        // widened to the bare interface breaks the whole client's action
        // inference in better-auth 1.7.x.
        ...(locale && {
            fetchPlugins: [
                {
                    id: 'tenancy-accept-language',
                    name: 'tenancy-accept-language',
                    hooks: {
                        onRequest(context) {
                            const url = typeof context.url === 'string' ? context.url : context.url.href
                            if (!url.includes('/tenancy/')) return
                            const value = typeof locale === 'function' ? locale() : locale
                            if (value) context.headers.set('Accept-Language', value)
                        },
                    },
                },
            ],
        }),
    } satisfies BetterAuthClientPlugin
}

export type * from '../types/index.js'
