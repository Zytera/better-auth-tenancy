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

// ---------------------------------------------------------------------------
// Regression: the header must reach the wire through better-auth's REAL client
// machinery, not just through our hook in isolation. 3.1.x shipped exactly the
// unit-tested intent with the wrong transport: a top-level `fetchOptions` on
// the plugin, which better-auth's `getClientConfig` silently drops (it only
// consumes `fetchPlugins` from client plugins). These tests fail if that shape
// is ever reintroduced: no `fetchOptions`-based header ever arrives here.
//
// The `getActions` signature must also keep its parameter types LAZY (see the
// exported `TenancyGetActionsFetch` alias): tsc inlines local aliases into the
// emitted d.ts frozen at build time, which breaks `BetterAuthClientPlugin`
// assignability on consumers running other better-auth versions (1.7.x moved
// ClientStore to @better-auth/core) and degrades their whole client inference.
// ---------------------------------------------------------------------------

import { createAuthClient } from 'better-auth/client'
import type { TenancyClientConfig } from './index'

type RecordedRequest = { path: string; acceptLanguage: string | null }

/** Local origin that records every incoming request and answers empty JSON. */
function startHeaderRecorder() {
  const requests: RecordedRequest[] = []
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      requests.push({ path: url.pathname, acceptLanguage: req.headers.get('accept-language') })
      return Response.json({})
    },
  })
  return {
    requests,
    baseURL: `http://localhost:${server.port}/api/auth`,
    stop: () => server.stop(true),
  }
}

function clientWithLocale(baseURL: string, config?: TenancyClientConfig) {
  return createAuthClient({
    baseURL,
    plugins: [tenancyClient(config)],
  })
}

test('wiring: static locale reaches the wire through a real better-auth client', async () => {
  const recorder = startHeaderRecorder()
  try {
    const client = clientWithLocale(recorder.baseURL, { locale: 'es' })

    await client.tenancy.organization.get({ id: 'org_1' })

    expect(recorder.requests).toHaveLength(1)
    expect(recorder.requests[0].path).toBe('/api/auth/tenancy/organization/org_1')
    expect(recorder.requests[0].acceptLanguage).toBe('es')
  } finally {
    recorder.stop()
  }
})

test('wiring: getter locale is re-evaluated per request through a real client', async () => {
  const recorder = startHeaderRecorder()
  try {
    let active = 'es'
    const client = clientWithLocale(recorder.baseURL, { locale: () => active })

    await client.tenancy.organization.get({ id: 'org_1' })
    active = 'en'
    await client.tenancy.organization.get({ id: 'org_1' })

    expect(recorder.requests.map((r) => r.acceptLanguage)).toEqual(['es', 'en'])
  } finally {
    recorder.stop()
  }
})

test('wiring: non-tenancy endpoints stay untouched through a real client', async () => {
  const recorder = startHeaderRecorder()
  try {
    const client = clientWithLocale(recorder.baseURL, { locale: 'es' })

    await client.signIn.email({ email: 'user@test.dev', password: 'secret' })

    expect(recorder.requests[0].path).toBe('/api/auth/sign-in/email')
    expect(recorder.requests[0].acceptLanguage).toBeNull()
  } finally {
    recorder.stop()
  }
})
