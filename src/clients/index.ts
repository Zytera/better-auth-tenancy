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
 *   plugins: [
 *     tenancyClient({
 *       locale: 'es',
 *       fetchOptions: {
 *         credentials: 'include' // Send cookies automatically
 *       }
 *     })
 *   ]
 * })
 * ```
 *
 * @example React Native/Expo (with Bearer tokens - recommended)
 * ```typescript
 * import { createAuthClient } from 'better-auth/react'
 * import { bearerClient } from 'better-auth/client/plugins'
 * import { expoClient } from '@better-auth/expo/client'
 * import { tenancyClient } from '@zytera/better-auth-tenancy/client'
 * import * as SecureStore from 'expo-secure-store'
 *
 * const authClient = createAuthClient({
 *   baseURL: 'https://api.example.com',
 *   plugins: [
 *     expoClient({
 *       scheme: 'myapp',
 *       storage: SecureStore,
 *     }),
 *     bearerClient(), // Recommended for React Native
 *     tenancyClient({ locale: 'es' })
 *   ]
 * })
 * ```
 *
 * @packageDocumentation
 */

import type { BetterAuthClientPlugin } from 'better-auth/client'

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
 * All server endpoints are explicitly implemented for full control.
 *
 * @param config - Optional client configuration
 * @returns BetterAuthClientPlugin
 */
export function tenancyClient(config?: TenancyClientConfig): BetterAuthClientPlugin {
  return {
    id: 'better-auth-tenancy',
    getActions: ($fetch) => {
      const fetchWithLocale = (path: string, options?: any) => {
        const headers = {
          ...options?.headers,
          ...(config?.locale && { 'Accept-Language': config.locale }),
        }
        return $fetch(path, { ...options, headers })
      }

      return {
        organization: {
          create: async (data: { name: string; slug: string; createdBy: string; metadata?: Record<string, unknown> }) => {
            return fetchWithLocale('/organization/create', {
              method: 'POST',
              body: data,
            })
          },
          get: async (data: { id: string }) => {
            return fetchWithLocale(`/organization/${data.id}`, {
              method: 'GET',
            })
          },
          update: async (data: { id: string; name?: string; slug?: string; updatedBy: string; metadata?: Record<string, unknown> }) => {
            const { id, ...body } = data
            return fetchWithLocale(`/organization/${id}`, {
              method: 'PATCH',
              body,
            })
          },
          delete: async (data: { id: string }) => {
            return fetchWithLocale(`/organization/${data.id}`, {
              method: 'DELETE',
            })
          },
          list: async () => {
            return fetchWithLocale('/organization/list', {
              method: 'GET',
            })
          },
        },
        team: {
          create: async (data: { organizationId: string; name: string; slug: string; createdBy: string; metadata?: Record<string, unknown> }) => {
            return fetchWithLocale('/team/create', {
              method: 'POST',
              body: data,
            })
          },
          get: async (data: { id: string }) => {
            return fetchWithLocale(`/team/${data.id}`, {
              method: 'GET',
            })
          },
          update: async (data: { id: string; name?: string; slug?: string; updatedBy: string; metadata?: Record<string, unknown> }) => {
            const { id, ...body } = data
            return fetchWithLocale(`/team/${id}`, {
              method: 'PATCH',
              body,
            })
          },
          delete: async (data: { id: string }) => {
            return fetchWithLocale(`/team/${data.id}`, {
              method: 'DELETE',
            })
          },
          listByOrganization: async (data: { organizationId: string }) => {
            return fetchWithLocale(`/team/list/${data.organizationId}`, {
              method: 'GET',
            })
          },
        },
        subteam: {
          create: async (data: { teamId: string; name: string; slug: string; createdBy: string; metadata?: Record<string, unknown> }) => {
            return fetchWithLocale('/subteam/create', {
              method: 'POST',
              body: data,
            })
          },
          get: async (data: { id: string }) => {
            return fetchWithLocale(`/subteam/${data.id}`, {
              method: 'GET',
            })
          },
          update: async (data: { id: string; name?: string; slug?: string; updatedBy: string; metadata?: Record<string, unknown> }) => {
            const { id, ...body } = data
            return fetchWithLocale(`/subteam/${id}`, {
              method: 'PATCH',
              body,
            })
          },
          delete: async (data: { id: string }) => {
            return fetchWithLocale(`/subteam/${data.id}`, {
              method: 'DELETE',
            })
          },
          listByTeam: async (data: { teamId: string }) => {
            return fetchWithLocale(`/subteam/list/${data.teamId}`, {
              method: 'GET',
            })
          },
        },
        statement: {
          create: async (data: { id: string; createdBy: string }) => {
            return fetchWithLocale('/statement/create', {
              method: 'POST',
              body: data,
            })
          },
          get: async (data: { id: string }) => {
            return fetchWithLocale(`/statement/${data.id}`, {
              method: 'GET',
            })
          },
          delete: async (data: { id: string }) => {
            return fetchWithLocale(`/statement/${data.id}`, {
              method: 'DELETE',
            })
          },
          listAll: async () => {
            return fetchWithLocale('/statement/list', {
              method: 'GET',
            })
          },
          addTranslation: async (data: { statementId: string; locale: string; name: string; description?: string; addedBy: string }) => {
            return fetchWithLocale('/statement/translation', {
              method: 'POST',
              body: data,
            })
          },
        },
        role: {
          create: async (data: { name: string; contextType: 'organization' | 'team'; contextId: string; statements?: string[]; createdBy: string; description?: string }) => {
            return fetchWithLocale('/role/create', {
              method: 'POST',
              body: data,
            })
          },
          get: async (data: { id: string }) => {
            return fetchWithLocale(`/role/${data.id}`, {
              method: 'GET',
            })
          },
          update: async (data: { id: string; name?: string; description?: string; updatedBy: string }) => {
            const { id, ...body } = data
            return fetchWithLocale(`/role/${id}`, {
              method: 'PATCH',
              body,
            })
          },
          delete: async (data: { id: string }) => {
            return fetchWithLocale(`/role/${data.id}`, {
              method: 'DELETE',
            })
          },
          list: async (data: { contextType: 'organization' | 'team'; contextId: string }) => {
            return fetchWithLocale(`/role/list/${data.contextType}/${data.contextId}`, {
              method: 'GET',
            })
          },
          addStatement: async (data: { id: string; statementId: string; addedBy: string }) => {
            return fetchWithLocale(`/role/${data.id}/statement`, {
              method: 'POST',
              body: { statementId: data.statementId, addedBy: data.addedBy },
            })
          },
          removeStatement: async (data: { id: string; statementId: string; removedBy: string }) => {
            return fetchWithLocale(`/role/${data.id}/statement/${data.statementId}`, {
              method: 'DELETE',
              body: { removedBy: data.removedBy },
            })
          },
        },
        member: {
          add: async (data: { userId: string; contextType: 'organization' | 'team' | 'subteam'; contextId: string; roleId?: string; addedBy: string; metadata?: Record<string, unknown> }) => {
            return fetchWithLocale('/member/add', {
              method: 'POST',
              body: data,
            })
          },
          updateRole: async (data: { id: string; roleId: string; updatedBy: string }) => {
            const { id, ...body } = data
            return fetchWithLocale(`/member/${id}/role`, {
              method: 'PATCH',
              body,
            })
          },
          remove: async (data: { id: string }) => {
            return fetchWithLocale(`/member/${data.id}`, {
              method: 'DELETE',
            })
          },
          list: async (data: { contextType: 'organization' | 'team' | 'subteam'; contextId: string }) => {
            return fetchWithLocale(`/member/list/${data.contextType}/${data.contextId}`, {
              method: 'GET',
            })
          },
          getUserMemberships: async (data: { userId: string }) => {
            return fetchWithLocale(`/member/user/${data.userId}`, {
              method: 'GET',
            })
          },
          checkMembership: async (data: { userId: string; contextType: 'organization' | 'team' | 'subteam'; contextId: string }) => {
            return fetchWithLocale('/member/check', {
              method: 'POST',
              body: data,
            })
          },
        },
        permission: {
          grant: async (data: { userId: string; statementId: string; contextType: 'organization' | 'team' | 'subteam'; contextId: string; grantedBy: string; expiresAt?: Date }) => {
            return fetchWithLocale('/permission/grant', {
              method: 'POST',
              body: data,
            })
          },
          deny: async (data: { userId: string; statementId: string; contextType: 'organization' | 'team' | 'subteam'; contextId: string; deniedBy: string }) => {
            return fetchWithLocale('/permission/deny', {
              method: 'POST',
              body: data,
            })
          },
          revoke: async (data: { userId: string; statementId: string; contextType: 'organization' | 'team' | 'subteam'; contextId: string; revokedBy: string }) => {
            return fetchWithLocale('/permission/revoke', {
              method: 'POST',
              body: data,
            })
          },
          check: async (data: { userId: string; statementId: string; contextType: 'organization' | 'team' | 'subteam'; contextId: string }) => {
            return fetchWithLocale('/permission/check', {
              method: 'POST',
              body: data,
            })
          },
          listGrants: async (data: { userId: string }) => {
            return fetchWithLocale(`/permission/grants/${data.userId}`, {
              method: 'GET',
            })
          },
          listDenies: async (data: { userId: string }) => {
            return fetchWithLocale(`/permission/denies/${data.userId}`, {
              method: 'GET',
            })
          },
        },
        invitation: {
          create: async (data: { email: string; contextType: 'organization' | 'team' | 'subteam'; contextId: string; roleId?: string; invitedBy: string; expiresInHours?: number }) => {
            return fetchWithLocale('/invitation/create', {
              method: 'POST',
              body: data,
            })
          },
          accept: async (data: { token: string }) => {
            return fetchWithLocale('/invitation/accept', {
              method: 'POST',
              body: data,
            })
          },
          reject: async (data: { token: string }) => {
            return fetchWithLocale('/invitation/reject', {
              method: 'POST',
              body: data,
            })
          },
          cancel: async (data: { id: string; cancelledBy: string }) => {
            return fetchWithLocale('/invitation/cancel', {
              method: 'POST',
              body: data,
            })
          },
          getByToken: async (data: { token: string }) => {
            return fetchWithLocale(`/invitation/token/${data.token}`, {
              method: 'GET',
            })
          },
          getByCode: async (data: { code: string }) => {
            return fetchWithLocale(`/invitation/code/${data.code}`, {
              method: 'GET',
            })
          },
          list: async (data: { contextType: 'organization' | 'team' | 'subteam'; contextId: string }) => {
            return fetchWithLocale(`/invitation/list/${data.contextType}/${data.contextId}`, {
              method: 'GET',
            })
          },
          cleanupExpired: async () => {
            return fetchWithLocale('/invitation/cleanup', {
              method: 'POST',
            })
          },
        },
      }
    },
  }
}

// Export types for convenience
export type * from '../types'