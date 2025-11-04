/**
 * Better Auth Tenancy - Client Plugin
 *
 * Type-safe client plugin for interacting with Better Auth Tenancy APIs.
 * Works on web, React Native, Node.js, and edge runtimes.
 *
 * @example
 * ```typescript
 * import { createAuthClient } from 'better-auth/client'
 * import { tenancyClient } from '@zytera/better-auth-tenancy/client'
 *
 * const authClient = createAuthClient({
 *   baseURL: '/api/auth',
 *   plugins: [
 *     tenancyClient({ locale: 'es' })
 *   ]
 * })
 *
 * // Use the client - endpoints are automatically inferred
 * const org = await authClient.organization.create({
 *   name: 'Acme Corp',
 *   slug: 'acme',
 *   createdBy: userId,
 * })
 *
 * const hasPermission = await authClient.permission.check({
 *   userId: 'user-123',
 *   statementId: 'team:create',
 *   contextType: 'organization',
 *   contextId: org.id,
 * })
 * ```
 */

import type { tenancy } from '../plugin'

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
 * Provides type-safe methods to interact with the tenancy plugin endpoints.
 * All server endpoints are automatically inferred and exposed as client methods.
 *
 * @param config - Optional client configuration
 * @returns BetterAuthClientPlugin
 */
export function tenancyClient(config?: TenancyClientConfig) {
  const plugin: any = {
    id: 'better-auth-tenancy',
    $InferServerPlugin: {} as ReturnType<typeof tenancy>,
  }

  // Add Accept-Language header if locale is configured
  if (config?.locale) {
    plugin.fetchOptions = {
      headers: {
        'Accept-Language': config.locale,
      },
    }
  }
  return plugin;

}

// Export types for convenience
export type * from '../types'