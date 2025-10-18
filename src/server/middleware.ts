import type { EndpointAuthHook, EndpointAuthContext } from '../types/config'

/**
 * Apply endpoint authorization hook if configured
 *
 * @param hook - The authorization hook from config
 * @param ctx - Better Auth endpoint context (contains body, params, query)
 *
 * @example
 * ```typescript
 * async (ctx) => {
 *   // Apply authorization if configured
 *   await applyEndpointAuth(config?.endpoints?.organization?.create, ctx)
 *
 *   // Continue with endpoint logic
 *   const org = await createOrganization(...)
 *   return ctx.json(org)
 * }
 * ```
 */
export async function applyEndpointAuth(
  hook: EndpointAuthHook | undefined,
  ctx: any
): Promise<void | any> {
  if (!hook) {
    // No authorization hook configured, skip
    return
  }

  const authContext: EndpointAuthContext = {
    ctx,
    body: ctx.body,
    params: ctx.params,
    query: ctx.query,
  }

  // Execute the authorization hook
  // Hook should throw an error if authorization fails
  return await hook(authContext)
}