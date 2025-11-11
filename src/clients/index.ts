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

export interface TenancyClientConfig {
    /**
     * Preferred locale for i18n (e.g., 'en', 'es', 'fr')
     * This will add the Accept-Language header to all requests
     */
    locale?: string
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
export function tenancyClient(config?: TenancyClientConfig): BetterAuthClientPlugin {
    return {
        id: 'better-auth-tenancy',

        getActions: ($fetch) => ({
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
                            organizationId: string;
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
                        data: { organizationId: string; slug: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/team/${data.organizationId}/by-slug/${data.slug}`, {
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
                            organizationId: string;
                            limit?: number;
                            offset?: number;
                            orderBy?: 'createdAt' | 'name';
                            orderDirection?: 'asc' | 'desc'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('organizationId', data.organizationId)
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

                subteam: {
                    create: async (
                        data: { teamId: string; name: string; slug: string; metadata?: Record<string, unknown> },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/subteam/create', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    get: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch(`/tenancy/subteam/${data.id}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    update: async (
                        data: { id: string; name?: string; slug?: string; metadata?: Record<string, unknown> },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/subteam/update', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    delete: async (
                        data: { id: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/subteam/delete', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    list: async (
                        data: {
                            teamId: string;
                            limit?: number;
                            offset?: number;
                            orderBy?: 'createdAt' | 'name';
                            orderDirection?: 'asc' | 'desc'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('teamId', data.teamId)
                        if (data.limit) params.set('limit', String(data.limit))
                        if (data.offset) params.set('offset', String(data.offset))
                        if (data.orderBy) params.set('orderBy', data.orderBy)
                        if (data.orderDirection) params.set('orderDirection', data.orderDirection)

                        return await $fetch(`/tenancy/subteam/list?${params}`, {
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
                            orderBy?: 'createdAt' | 'id';
                            orderDirection?: 'asc' | 'desc'
                        },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        if (data?.limit) params.set('limit', String(data.limit))
                        if (data?.offset) params.set('offset', String(data.offset))
                        if (data?.orderBy) params.set('orderBy', data.orderBy)
                        if (data?.orderDirection) params.set('orderDirection', data.orderDirection)

                        return await $fetch(`/tenancy/statement/list?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    batchCreate: async (
                        data: { statements: string[]; createdBy: string },
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

                        return await $fetch(`/tenancy/role/list?${params}`, {
                            method: 'GET',
                            ...fetchOptions,
                        })
                    },

                    addStatement: async (
                        data: { id: string; statementId: string; addedBy: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/role/statement/add', {
                            method: 'POST',
                            body: data,
                            ...fetchOptions,
                        })
                    },

                    removeStatement: async (
                        data: { id: string; statementId: string; removedBy: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        return await $fetch('/tenancy/role/statement/remove', {
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
                            contextType: 'organization' | 'team' | 'subteam';
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
                            contextType: 'organization' | 'team' | 'subteam';
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
                            contextType?: 'organization' | 'team' | 'subteam';
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
                        data: { userId: string; contextType: 'organization' | 'team' | 'subteam'; contextId: string },
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
                            contextType: 'organization' | 'team' | 'subteam';
                            contextId: string;
                            expiresAt?: Date;
                            grantedBy: string
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
                            contextType: 'organization' | 'team' | 'subteam';
                            contextId: string;
                            deniedBy: string
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
                            userId: string;
                            statementId: string;
                            contextType: 'organization' | 'team' | 'subteam';
                            contextId: string;
                            revokedBy: string
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
                            contextType: 'organization' | 'team' | 'subteam';
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

                    grantBatch: async (
                        data: {
                            grants: Array<{
                                userId: string;
                                statementId: string;
                                contextType: 'organization' | 'team' | 'subteam';
                                contextId: string;
                                expiresAt?: Date
                            }>;
                            grantedBy: string
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
                                contextType: 'organization' | 'team' | 'subteam';
                                contextId: string
                            }>;
                            deniedBy: string
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
                            email: string;
                            contextType: 'organization' | 'team' | 'subteam';
                            contextId: string;
                            roleId?: string;
                            expiresInHours?: number;
                            invitedBy: string
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
                        data: { id: string; canceledBy: string },
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
                            contextType: 'organization' | 'team' | 'subteam';
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
                        data: { identifier: string },
                        fetchOptions?: BetterFetchOption
                    ) => {
                        const params = new URLSearchParams()
                        params.set('identifier', data.identifier)

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

        // Apply locale header if configured
        ...(config?.locale && {
            fetchOptions: {
                headers: {
                    'Accept-Language': config.locale,
                },
            },
        }),
    }
}

// Export types for convenience
export type * from '../types'
