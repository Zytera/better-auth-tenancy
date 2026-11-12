import { getSessionFromCtx, APIError } from 'better-auth/api'
import type { EndpointAuthHook, EndpointAuthContext } from '../types/config.js'

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
  // ponytail: catch here because getSessionFromCtx can throw (not just return null)
  // when better-auth rejects an invalid/expired token internally — that throw would
  // otherwise surface as a 500 instead of 401.
  let session: any
  try {
    session = await getSessionFromCtx(ctx)
  } catch {
    throw new APIError('UNAUTHORIZED', {
      message: 'Authentication required. Please provide valid credentials.',
    })
  }

  if (!session || !session.user) {
    throw new APIError('UNAUTHORIZED', {
      message: 'Authentication required. Please provide valid credentials.',
    })
  }

  return session
}

/**
 * Get session from request context without requiring it.
 *
 * Unlike {@link requireSession}, this never throws: it resolves to `null` for
 * anonymous callers (or when better-auth rejects an invalid token). Use it on
 * endpoints that must work without a session (e.g. token-based invitation
 * flows) but whose authorization hook benefits from knowing the caller.
 *
 * @param ctx - Better Auth endpoint context
 * @returns Session data, or null if not authenticated
 */
export async function getOptionalSession(ctx: any): Promise<any | null> {
  try {
    const session = await getSessionFromCtx(ctx)
    return session && session.user ? session : null
  } catch {
    return null
  }
}

/**
 * Apply endpoint authorization hook (read endpoints).
 *
 * Default authorization floor when no hook is configured: the caller must be
 * authenticated. This is fail-closed against anonymous access — unauthenticated
 * callers get 401 instead of reading tenant data. A configured hook fully
 * replaces this default and may allow anonymous access (e.g. token-based
 * invitation lookups) or restrict access further (e.g. membership checks).
 *
 * For write endpoints use {@link requireEndpointAuth} instead: there the
 * default is stricter (403 even for authenticated callers).
 *
 * @param hook - The authorization hook from config
 * @param ctx - Better Auth endpoint context (contains body, params, query)
 * @param session - Pre-fetched session (null if not authenticated)
 *
 * @throws {APIError} UNAUTHORIZED if no hook is configured and the caller is
 * not authenticated
 *
 * @example
 * ```typescript
 * createAuthEndpoint('/organization/:id', {
 *   method: 'GET',
 * }, async (ctx) => {
 *   const session = await getSessionFromCtx(ctx)
 *
 *   // Authorization: hook if configured, otherwise "any authenticated user"
 *   await applyEndpointAuth(config?.endpoints?.organization?.read, ctx, session)
 *
 *   // Continue with endpoint logic
 *   const org = await getOrganization(...)
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
    // No authorization hook configured: fail-closed against anonymous access.
    // Any authenticated caller may proceed (the documented default floor).
    if (!session?.user) {
      throw new APIError('UNAUTHORIZED', {
        message: 'Authentication required. Please provide valid credentials.',
      })
    }
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

/**
 * Apply endpoint authorization hook with a fail-closed default (write
 * endpoints).
 *
 * Creating, updating or deleting tenant data without a configured
 * authorization hook is denied with 403 — even for authenticated callers.
 * A missing hook is a configuration error, never an implicit "allow": leaving
 * it unconfigured used to turn every write endpoint into
 * "any authenticated user", which let any account delete organizations, add
 * itself as a member or grant itself permissions (CWE-862).
 *
 * Token-based endpoints without a user session (invitation accept/reject,
 * cleanup) must still configure a hook; it receives the optional session.
 *
 * @param hook - The authorization hook from config
 * @param ctx - Better Auth endpoint context (contains body, params, query)
 * @param session - Pre-fetched session (null if not authenticated)
 *
 * @throws {APIError} FORBIDDEN if no hook is configured
 *
 * @example
 * ```typescript
 * createAuthEndpoint('/organization/delete', {
 *   method: 'POST',
 * }, async (ctx) => {
 *   const session = await requireSession(ctx)
 *
 *   // No hook configured -> 403, even for authenticated callers
 *   await requireEndpointAuth(config?.endpoints?.organization?.delete, ctx, session)
 *
 *   // Continue with endpoint logic
 *   ...
 * })
 * ```
 */
export async function requireEndpointAuth(
  hook: EndpointAuthHook | undefined,
  ctx: any,
  session: any = null
): Promise<void | any> {
  if (!hook) {
    throw new APIError('FORBIDDEN', {
      message:
        'Forbidden: no authorization hook is configured for this endpoint (fail-closed default). Configure config.endpoints in the tenancy plugin to control this operation.',
    })
  }

  const authContext: EndpointAuthContext = {
    ctx,
    session,
  }

  return await hook(authContext)
}

/**
 * Self-only authorization floor for subject/identifier lookups.
 *
 * These endpoints (getUserMemberships, checkMembership, getInvitationsByIdentifier)
 * look up by userId/identifier, not by context, so the context-scoped list hook
 * can't authorize them. Default: caller may only query their own subject. A
 * configured hook acts as the admin override. Unlike applyEndpointAuth (which
 * allows any authenticated caller when no hook is set), the no-hook path here
 * is deny for every non-self subject.
 *
 * @throws {APIError} FORBIDDEN if not self and no override hook is configured
 */
export async function requireSelfOr(
  isSelf: boolean,
  hook: EndpointAuthHook | undefined,
  ctx: any,
  session: any,
): Promise<void> {
  if (isSelf) return
  if (!hook) {
    throw new APIError('FORBIDDEN', {
      message: 'You can only access your own resources.',
    })
  }
  await applyEndpointAuth(hook, ctx, session)
}