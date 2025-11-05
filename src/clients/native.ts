/**
 * Better Auth Tenancy - React Native/Expo Client Plugin
 *
 * Optimized for React Native/Expo environments.
 * Works with @better-auth/expo plugin for session management.
 *
 * @example
 * ```typescript
 * import { createAuthClient } from 'better-auth/react'
 * import { tenancyClient } from '@zytera/better-auth-tenancy/clients/native'
 *
 * const authClient = createAuthClient({
 *   baseURL: 'https://api.example.com/api/auth',
 *   plugins: [
 *     tenancyClient({ locale: 'es' })
 *   ]
 * })
 *
 * // Session is handled by @better-auth/expo
 * const org = await authClient.organization.create({
 *   name: 'Acme Corp',
 *   slug: 'acme',
 *   createdBy: userId,
 * })
 * ```
 */

import type { BetterAuthClientPlugin } from 'better-auth/client'
import type { tenancy } from '../plugin'

export interface TenancyClientConfig {
  /**
   * Preferred locale for i18n (e.g., 'en', 'es', 'fr')
   * This will add the Accept-Language header to all requests
   */
  locale?: string
}

/**
 * Better Auth Tenancy Client Plugin for React Native/Expo
 *
 * Provides type-safe methods to interact with the tenancy plugin endpoints.
 * All server endpoints are automatically inferred and exposed as clients methods.
 *
 * Works with @better-auth/expo plugin for session management.
 *
 * @param config - Optional clients configuration
 * @returns BetterAuthClientPlugin
 */
export function tenancyClient(config?: TenancyClientConfig): BetterAuthClientPlugin {
  const plugin: any = {
    id: 'better-auth-tenancy',
    $InferServerPlugin: {} as ReturnType<typeof tenancy>,
    fetchOptions: {
      headers: {
        ...(config?.locale && { 'Accept-Language': config.locale }),
      },
    },
  }

  return plugin
}

// Export types for convenience
export type * from '../types'
