import { test, expect } from 'bun:test'
import { tenancyClient } from './index'

// The plugin must expose the Accept-Language header through `fetchPlugins`:
// better-auth's client ignores a top-level `fetchOptions` on client plugins,
// so that shape never reached the wire (see tenancyClient source comment).

type FetchPlugin = NonNullable<ReturnType<typeof tenancyClient>['fetchPlugins']>[number]

function acceptLanguagePlugin(locale: 'es' | (() => string) | undefined): FetchPlugin | undefined {
  const plugin = tenancyClient(locale === undefined ? {} : { locale }) as {
    fetchPlugins?: FetchPlugin[]
  }
  return plugin.fetchPlugins?.[0]
}

function contextOf(url: string) {
  return { url, headers: new Headers() }
}

test('tenancyClient: no fetchPlugins without locale', () => {
  expect(acceptLanguagePlugin(undefined)).toBeUndefined()
})

test('tenancyClient: static locale sets Accept-Language on /tenancy/* requests', () => {
  const hook = acceptLanguagePlugin('es')!.hooks!.onRequest!
  const context = contextOf('https://app.test/api/auth/tenancy/organization/create')

  hook(context as never)

  expect(context.headers.get('Accept-Language')).toBe('es')
})

test('tenancyClient: leaves other endpoints untouched', () => {
  const hook = acceptLanguagePlugin('es')!.hooks!.onRequest!
  const context = contextOf('https://app.test/api/auth/sign-in/email-otp')

  hook(context as never)

  expect(context.headers.get('Accept-Language')).toBeNull()
})

test('tenancyClient: getter locale is evaluated per request', () => {
  let active = 'es'
  const hook = acceptLanguagePlugin(() => active)!.hooks!.onRequest!
  const first = contextOf('https://app.test/api/auth/tenancy/role/list')
  const second = contextOf('https://app.test/api/auth/tenancy/role/list')

  hook(first as never)
  active = 'en'
  hook(second as never)

  expect(first.headers.get('Accept-Language')).toBe('es')
  expect(second.headers.get('Accept-Language')).toBe('en')
})

test('tenancyClient: URL objects are handled too', () => {
  const hook = acceptLanguagePlugin('en')!.hooks!.onRequest!
  const context = contextOf(new URL('https://app.test/api/auth/tenancy/member/list'))

  hook(context as never)

  expect(context.headers.get('Accept-Language')).toBe('en')
})
