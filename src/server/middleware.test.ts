import { test, expect } from 'bun:test'
import { requireSelfOr } from './middleware'

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