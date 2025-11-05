/**
 * Better Auth Tenancy - Web/Browser Client Plugin
 *
 * Optimized for web environments with automatic cookie handling.
 * Uses credentials: 'include' to send cookies automatically.
 *
 * @example
 * ```typescript
 * import { createAuthClient } from 'better-auth/client'
 * import { tenancyClient } from '@zytera/better-auth-tenancy/client/web'
 *
 * const authClient = createAuthClient({
 *   baseURL: '/api/auth',
 *   plugins: [
 *     tenancyClient({ locale: 'es' })
 *   ]
 * })
 *
 * // Cookies are sent automatically
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
 * Better Auth Tenancy Client Plugin for Web/Browser
 *
 * Provides type-safe methods to interact with the tenancy plugin endpoints.
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
      // Include credentials (cookies) in all requests for authentication
      credentials: 'include',
      headers: {
        ...(config?.locale && { 'Accept-Language': config.locale }),
      },
    },
  }

  return plugin
}

// Export types for convenience
export type * from '../types'