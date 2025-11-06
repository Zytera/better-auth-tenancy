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
import type { BetterFetchOption } from '@better-fetch/fetch'
import type { tenancy } from '../server/plugin'

export interface TenancyClientConfig {
  /**
   * Preferred locale for i18n (e.g., 'en', 'es', 'fr')
   * This will add the Accept-Language header to all requests
   */
  locale?: string

  /**
   * Additional fetch options to pass to all tenancy requests.
   * These will be merged with default options.
   *
   * **For Web:**
   * Set `credentials: 'include'` to send cookies automatically:
   * ```typescript
   * tenancyClient({
   *   fetchOptions: {
   *     credentials: 'include'
   *   }
   * })
   * ```
   *
   * **For React Native:**
   * React Native has known issues with cookie-based authentication:
   * - `credentials:omit` doesn't work properly
   * - Cookie-based auth is unstable overall
   * - iOS has issues with 302 redirects + Set-Cookie headers
   *
   * **Recommended:** Use Bearer token authentication with the `bearerClient()` plugin
   * from better-auth instead of cookies for React Native apps.
   *
   * @see https://reactnative.dev/docs/network#known-issues-with-fetch-and-cookie-based-authentication
   *
   * @example
   * ```typescript
   * import { createAuthClient } from 'better-auth/react'
   * import { tenancyClient } from '@zytera/better-auth-tenancy/client'
   *
   * const authClient = createAuthClient({
   *   baseURL: 'https://api.example.com',
   *   plugins: [
   *     tenancyClient({
   *       locale: 'es',
   *       fetchOptions: {
   *         headers: {
   *           'X-Custom-Header': 'value'
   *         }
   *       }
   *     })
   *   ]
   * })
   * ```
   */
  fetchOptions?: BetterFetchOption
}

/**
 * Better Auth Tenancy Client Plugin
 *
 * Universal client plugin that works in both web and React Native/Expo environments.
 * All server endpoints are automatically inferred and exposed as client methods.
 *
 * @param config - Optional client configuration
 * @returns BetterAuthClientPlugin
 */
export function tenancyClient(config?: TenancyClientConfig): BetterAuthClientPlugin {
  const plugin: any = {
    id: 'better-auth-tenancy',
    $InferServerPlugin: {} as ReturnType<typeof tenancy>,
    fetchOptions: {
      // Merge user-provided fetchOptions
      ...(config?.fetchOptions || {}),
      // Apply headers (will override any headers from fetchOptions)
      headers: {
        ...(config?.fetchOptions?.headers || {}),
        ...(config?.locale && { 'Accept-Language': config.locale }),
      },
    },
  }

  return plugin
}

// Export types for convenience
export type * from '../types'
