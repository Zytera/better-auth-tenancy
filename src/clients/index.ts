/**
 * Better Auth Tenancy - Universal Client Plugin
 *
 * Works seamlessly in both web and React Native/Expo environments.
 * Uses automatic type inference from server plugin.
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
 *     })
 *   ]
 * })
 * ```
 *
 * @example React Native/Expo (with Bearer tokens)
 * ```typescript
 * import { createAuthClient } from 'better-auth/react'
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
 * All endpoints are automatically inferred from the server plugin.
 *
 * @param config - Optional client configuration
 * @returns BetterAuthClientPlugin
 */
export function tenancyClient(config?: TenancyClientConfig): BetterAuthClientPlugin {
  return {
    id: 'better-auth-tenancy',

    // Type inference from server plugin
    $InferServerPlugin: {} as ReturnType<typeof import('../server/plugin').tenancy>,

    // Add Accept-Language header if locale is configured
    ...(config?.locale && {
      fetchOptions: {
        headers: {
          'Accept-Language': config.locale
        }
      }
    })
  }
}

// Export types for convenience
export type * from '../types'
