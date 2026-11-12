import { test, expect } from 'bun:test'
import { requireSelfOr, applyEndpointAuth, requireEndpointAuth, getOptionalSession, requireSession } from './middleware'

// Security floor: self passes, non-self with no hook is fail-CLOSED,
// non-self delegates to the hook (admin override).

test('requireSelfOr: self is allowed without a hook', async () => {
  await requireSelfOr(true, undefined, {}, null) // resolves, no throw
})

test('requireSelfOr: non-self with no hook is forbidden', async () => {
  await expect(requireSelfOr(false, undefined, {}, null)).rejects.toThrow()
})

test('requireSelfOr: non-self delegates to the hook', async () => {
  let called = false
  await requireSelfOr(false, async () => { called = true }, {}, { user: { id: 'x' } })
  expect(called).toBe(true)
})

test('requireSelfOr: hook denial propagates', async () => {
  const deny = async () => { throw new Error('denied') }
  await expect(requireSelfOr(false, deny, {}, null)).rejects.toThrow('denied')
})

// applyEndpointAuth (read floor): no hook + anonymous is fail-CLOSED (401),
// no hook + authenticated caller passes, a configured hook fully replaces the
// default.

test('applyEndpointAuth: no hook + anonymous is UNAUTHORIZED', async () => {
  await expect(applyEndpointAuth(undefined, {}, null)).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
})

test('applyEndpointAuth: no hook + session without user is UNAUTHORIZED', async () => {
  await expect(applyEndpointAuth(undefined, {}, { session: { id: 's1' } })).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
})

test('applyEndpointAuth: no hook + authenticated caller is allowed', async () => {
  await applyEndpointAuth(undefined, {}, { user: { id: 'u1' } }) // resolves, no throw
})

test('applyEndpointAuth: hook receives ctx and session', async () => {
  let received: any = null
  await applyEndpointAuth(async (authCtx) => { received = authCtx }, { body: { id: 'x' } }, { user: { id: 'u1' } })
  expect(received.ctx.body.id).toBe('x')
  expect(received.session.user.id).toBe('u1')
})

test('applyEndpointAuth: hook denial propagates', async () => {
  const deny = async () => { throw new Error('denied') }
  await expect(applyEndpointAuth(deny, {}, { user: { id: 'u1' } })).rejects.toThrow('denied')
})

// requireEndpointAuth (write floor): a missing hook is a configuration error
// and denies EVERY caller, authenticated or not.

test('requireEndpointAuth: no hook is FORBIDDEN even when authenticated', async () => {
  await expect(
    requireEndpointAuth(undefined, {}, { user: { id: 'u1' } })
  ).rejects.toMatchObject({ status: 'FORBIDDEN' })
})

test('requireEndpointAuth: no hook is FORBIDDEN for anonymous callers too', async () => {
  await expect(requireEndpointAuth(undefined, {}, null)).rejects.toMatchObject({ status: 'FORBIDDEN' })
})

test('requireEndpointAuth: hook receives ctx and session', async () => {
  let received: any = null
  await requireEndpointAuth(async (authCtx) => { received = authCtx }, { body: { id: 'x' } }, { user: { id: 'u1' } })
  expect(received.ctx.body.id).toBe('x')
  expect(received.session.user.id).toBe('u1')
})

test('requireEndpointAuth: hook denial propagates', async () => {
  const deny = async () => { throw new Error('denied') }
  await expect(requireEndpointAuth(deny, {}, null)).rejects.toThrow('denied')
})

// getOptionalSession: never throws; resolves session via the context fast
// path or null for anonymous callers.

test('getOptionalSession: returns the session present in ctx', async () => {
  const session = { user: { id: 'u1' }, session: { id: 's1' } }
  const result = await getOptionalSession({ context: { session } })
  expect(result.user.id).toBe('u1')
})

test('getOptionalSession: returns null for anonymous callers', async () => {
  const result = await getOptionalSession({ context: {} })
  expect(result).toBeNull()
})

// requireSession keeps throwing UNAUTHORIZED for anonymous callers.

test('requireSession: anonymous is UNAUTHORIZED', async () => {
  await expect(requireSession({ context: {} })).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
})