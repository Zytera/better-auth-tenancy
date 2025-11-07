import { getSessionFromCtx, APIError } from 'better-auth/api'
import type { EndpointAuthHook, EndpointAuthContext } from '../types/config'

/**
 * Get authenticated session from request context.
 * Supports both cookie-based and Bearer token authentication automatically.
 *
 * @param ctx - Better Auth endpoint context
 * @returns Session data if authenticated, throws APIError if not
 *
 * @throws {APIError} UNAUTHORIZED if no valid session found
 *
 * @example
 * ```typescript
 * createAuthEndpoint('/organization/create', {
 *   method: 'POST',
 * }, async (ctx) => {
 *   const session = await requireSession(ctx)
 *   const userId = session.user.id
 *   // ... use authenticated user
 * })
 * ```
 */
export async function requireSession(ctx: any) {
  const session = await getSessionFromCtx(ctx)

  if (!session || !session.user) {
    throw new APIError('UNAUTHORIZED', {
      message: 'Authentication required. Please provide valid credentials.',
    })
  }

  return session
}

/**
 * Apply endpoint authorization hook if configured
 *
 * @param hook - The authorization hook from config
 * @param ctx - Better Auth endpoint context (contains body, params, query)
 * @param session - Pre-fetched session (null if not authenticated)
 *
 * @example
 * ```typescript
 * createAuthEndpoint('/organization/create', {
 *   method: 'POST',
 * }, async (ctx) => {
 *   // First require authentication
 *   const session = await requireSession(ctx)
 *
 *   // Then apply authorization if configured
 *   await applyEndpointAuth(config?.endpoints?.organization?.create, ctx, session)
 *
 *   // Continue with endpoint logic
 *   const org = await createOrganization(...)
 *   return ctx.json(org)
 * })
 * ```
 */
export async function applyEndpointAuth(
  hook: EndpointAuthHook | undefined,
  ctx: any,
  session: any = null
): Promise<void | any> {
  if (!hook) {
    // No authorization hook configured, skip
    return
  }

  const authContext: EndpointAuthContext = {
    ctx,
    session,
  }

  // Execute the authorization hook
  // Hook should throw an error if authorization fails
  return await hook(authContext)
}