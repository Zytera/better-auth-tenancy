# Changelog

## 4.1.0

### Internal

- **Regression guard for the security dependency floors:
  `bun run check:security-deps` (#37).** The resolved tree is already
  outside every vulnerable range fixed by this epic — `defu@6.1.7`
  (`>= 6.1.5`: dragged out of the vulnerable `<= 6.1.4` range by the
  better-auth 1.7.22 lockfile upgrade of #33; the only route to defu is
  better-auth's own dependency, with a single lockfile resolution and no
  nested duplicates), `kysely@0.28.20` (`>= 0.28.17`, floor of #38) and
  `zod@4.6.7` (`>= 4.6.6`, floor of #35) — and this guard keeps it that
  way. `scripts/check-security-deps.ts` parses `bun.lock`, checks **every**
  resolution (root and nested) of the three dependency findings of epic #40
  against its pinned floor, and fails the build naming the offending
  version and the originating issue if any of them regresses (it also fails
  closed when a watched package has no resolution at all, so a lockfile
  format change cannot silently neuter it).
  - Wired into CI: it runs in the `audit` job right after
    `bun audit --audit-level=high`, so the vulnerable ranges cannot return
    even if advisory data is unavailable to the audit gate (defu < 6.1.5 is
    GHSA-737v-mqg7-c878, CWE-1395/CWE-1321 prototype pollution via
    `__proto__`, high severity).

- **`kysely` is resolved outside the vulnerable range of its three SQL
  injection advisories (#38, CWE-1395/CWE-89, A03:2025).**
  `kysely >= 0.26.0 < 0.28.17` is affected by GHSA-pv5w-4p9q-p3v2 (JSON
  path traversal), GHSA-wmrf-hv6w-mr66 (SQL injection via JSON path keys)
  and GHSA-8cpq-38p9-67gx (MySQL SQL injection via `sql.lit`). The plugin
  builds no SQL of its own — every query goes through better-auth's
  adapter — so the vector lives in the host consumer stack, and it is
  closed there: the better-auth 1.7.22 lockfile upgrade of #33 (which
  depends on `kysely ^0.28.17 || ^0.29.0`) dragged `kysely` 0.28.8 →
  0.28.20, past every patched version, without a lockfile change in this
  release.
  - Verified at closure: the lockfile holds a single `kysely@0.28.20`
    resolution (no nested duplicates under other packages), `bun audit
    --audit-level=high` reports no findings, and the `check:security-deps`
    guard of #37 (above) pins the `>= 0.28.17` floor across every lockfile
    resolution in CI.

- **Regression coverage for the `permission.revoke` hook session forwarding
  (#36, CWE-863/CWE-755).** The session has been passed to the hook since
  4.0.0 (via `requireEndpointAuth`); new tests pin the contract end-to-end:
  an identity-authorizing hook sees the caller's identity and the revoke
  completes (previously the hook received `session: null`, which crashed
  identity-based hooks with a `TypeError` -> 500 and let null-blind hooks
  silently authorize revoking anyone's permissions).

- **Post-review hardening of the 4.1.0 release.** Package version bumped
  from 4.0.0 to 4.1.0 (the README already referenced 4.1.0 as the
  breakpoint for pre-upgrade invitation behavior); `invitation/reject`
  now enforces the same code-format validation as `by-code`/`accept`
  (legacy 6-character codes -> `400 Bad Request` on every code-entry
  point); the peer-compat CI job also runs `type-check` against the
  pinned better-auth floor; and a regression test pins that anonymous
  oracle calls return 401 even when hooks are configured (the documented
  #34 contract).

### Breaking (security)

- **The `zod` peer dependency floor is now `^4.6.6` (#35, GHSA-mrhx-c7xc-m3w5,
  CWE-1395/CWE-400, A03:2025).** Zod versions below 4.6.6 can exhaust memory
  while validating oversized constrained collections (e.g. `z.array().max()`
  in consumer-configured metadata schemas), and the development lockfile
  resolved the root `zod` to 4.1.12. All request validation across the
  ~40 `/tenancy/*` endpoints (body/params/query) goes through zod schemas,
  so the advisory applied to the plugin's whole request surface.
  - **Breaking:** consumers must run `zod >=4.6.6` (declared range `^4.6.6`;
    the floor is not lowered below the patched 4.6.6). The lockfile now
    resolves a single root `zod@4.6.7` (latest stable 4.x), deduplicating
    the previously nested `better-auth`/`@better-auth/core` scopes; the same
    4.6.7 satisfies better-auth 1.4.5's `zod ^4.1.12` dependency and 1.7.x's
    `zod ^4.5.4`, so the peer-compat matrix stays intact.
  - CI: the `--ignore GHSA-mrhx-c7xc-m3w5` exception is removed from the
    dependency-audit gate, which now runs exception-free
    (`bun audit --audit-level=high`).

- **Invitation short codes are now generated with a CSPRNG over a 40-bit
  keyspace (#30, CWE-338/CWE-330).** `generateInvitationCode` previously used
  `Math.random()` over a 6-character `XXXYYY` format: 26³ × 10³ =
  17,576,000 combinations (~17.6 million — not the "~2.2 billion" the code
  comment claimed), trivially brute-forceable online, with a
  non-cryptographic PRNG whose state is recoverable from observed outputs.
  Codes are now 8 characters drawn with `crypto.randomInt` from an
  unambiguous 32-character alphabet (A-H J-N P-Z 2-9; `I`/`O`/`0`/`1`
  excluded for manual entry): 32⁸ = 2⁴⁰ ≈ 1.1 × 10¹² combinations, same
  CSPRNG as the link/QR token.
  - **Breaking:** `isValidInvitationCode` (and therefore
    `GET /tenancy/invitation/by-code/:code`, the `invitationCode` path of
    `POST /tenancy/invitation/accept`, and — aligned in the 4.1.0 review —
    the `invitationCode` path of `POST /tenancy/invitation/reject`) rejects
    the legacy 6-character format with `400 Bad Request`: pending
    invitations created by earlier versions must be re-issued. Token-based
    (link/QR) invitations are unaffected — the long token already used a
    CSPRNG.
  - Rate limiting per code and per IP for `by-code`/`accept` remains the
    consumer's responsibility, as for the other invitation endpoints (see
    Security Best Practices in the README).

- **The permission oracle no longer leaks other users' authorization state
  (#34, CWE-862/CWE-200).** `POST /tenancy/permission/check`,
  `GET /tenancy/permission/grants` and `GET /tenancy/permission/denies` now
  follow the same self-or-hook pattern as `member.getMemberships`:
  - A valid session is always required: anonymous callers get **401**, even
    when a hook is configured (previously a hook could allow anonymous
    probing).
  - Authenticated callers may query **their own** permissions without any
    hook.
  - Queries about **another user** require the `permission.check`,
    `permission.listGrants` or `permission.listDenies` hook; without one
    they get **403** instead of the full resolution (grants/denies include
    `grantedBy`/`expiresAt`, making them reconnaissance material).

- **The `better-auth` peer dependency floor is now `>=1.4.5` (#33, A03:2025
  supply chain).** The development lockfile resolved `better-auth@1.3.27`,
  affected by 21 aggregated advisories — 2 critical (2FA bypass via
  `session.cookieCache`, GHSA-xg6x-h9c9-2m83; OAuth refresh-token replay,
  GHSA-pw9m-5jxm-xr6h), 15 high, 2 moderate, 2 low — while the declared peer
  range allowed any version `>=1.0.0`.
  - **Breaking:** consumers must run `better-auth >=1.4.5` (the minimum
    release that carries the security fixes and still exports every API the
    plugin uses). The development lockfile now pins `better-auth@1.7.22`
    (latest stable 1.x), which the full suite (199 tests), strict
    type-check and build pass against.
  - Plugin code change for the 1.7.x line: the `Adapter` type alias was
    removed upstream; the plugin now imports `DBAdapter` (the canonical
    type, exported throughout the supported range 1.4.5 → latest).
  - CI: the advisory dependency-audit job is now a **gate** (`bun audit
    --audit-level=high`, fails on high/critical; at the time it temporarily
    accepted the zod < 4.6.6 high owned by #35, whose landing removes the
    exception), and the peer
    compatibility matrix now tests the new floor (`1.4.5`) and `latest` —
    the previous `1.2.12` pivot violated the new peer range.
  - Collateral updates dragged by the better-auth upgrade in the dev
    lockfile: `defu` 6.1.4 → 6.1.7 and `kysely` 0.28.8 → 0.28.20 (both
    patched lines, no audit findings) and `jose` 6.1.0 → 6.2.17. The root
    `zod` (dev + peer) floor is raised to `>=4.6.6` by #35 in this same
    release.

## 4.0.0

### Breaking (security)

- **Endpoint authorization is now fail-closed by default (CWE-862).**
  Previously every endpoint only required a valid session and all
  authorization was delegated to OPTIONAL hooks: with no `endpoints` config —
  the documented quickstart setup — any authenticated user could delete any
  organization, add itself as a member or grant itself permissions, bypassing
  the RBAC model entirely.
  - **Write endpoints** (create/update/delete of organizations, teams,
    members, roles, statements, invitations and all permission grant/deny/
    revoke/batch endpoints, plus invitation accept/reject/cleanup) now
    return **403** for every request — authenticated or not — until the
    consumer configures the corresponding hook in `config.endpoints`.
  - **Read endpoints** now require an authenticated session when no hook is
    configured (anonymous callers get **401** instead of the full response).
    A configured hook fully replaces this default; token-based flows such as
    invitation accept/reject/by-token keep working by configuring a no-op
    hook (the token is the credential), which was already the pattern used by
    the `auth` service.
  - `GET /tenancy/permission/check` now resolves the (optional) session and
    passes it to the `permission.check` hook instead of always passing
    `session: null`; anonymous calls without a hook get 401.
  - **`POST /tenancy/permission/revoke` now passes the session to its hook**
    (it was always `null` — hook implementations reading `session` silently
    misbehaved).
  - Invitation accept/reject/cleanup endpoints now resolve the optional
    session and pass it to their hooks.
  - The plugin logs a **console warning at startup** when no endpoint hooks
    are configured at all.

  Consumers must review their `tenancy({ endpoints: ... })` configuration:
  any operation that used to pass because no hook was configured will now
  fail with 403 (writes) or 401 (anonymous reads).

### Added

- `requireEndpointAuth` and `getOptionalSession` exported from
  `@zytera/better-auth-tenancy/server` alongside the existing
  `requireSession` / `applyEndpointAuth` middleware helpers.

## 3.2.1

### Fixed

- **`dist` types no longer depend on the build-time better-auth version.**
  The `getActions` parameter type was a local alias, which declaration emit
  inlines into the emitted d.ts resolved against the better-auth installed at
  build time — breaking `BetterAuthClientPlugin` assignability (and degrading
  client action inference) for consumers running other versions. It is now the
  exported `TenancyGetActionsFetch` alias, which stays lazy in the d.ts and
  resolves against the consumer's own better-auth install (peer range
  `>=1.0.0`).

### Internal

- ESLint migrated to flat config and added as a real devDependency (the lint
  script had been failing silently: no local eslint installed, legacy config
  unreadable by modern ESLint).
- Wiring regression tests through a real better-auth client: `Accept-Language`
  must reach the wire on `/tenancy/*` and never elsewhere.

## 3.2.0

### Fixed

- **`tenancyClient({ locale })` never reached the wire.** better-auth's client
  only consumes `getActions`, `getAtoms`, `pathMethods`, `atomListeners` and
  `fetchPlugins` from client plugins; the top-level `fetchOptions` the plugin
  returned was silently ignored, so no `Accept-Language` header was ever sent
  (verified against better-auth 1.7.x). The header is now applied through a
  better-fetch plugin, scoped to `/tenancy/*` requests.
- **`dist` was not loadable from Node ESM.** All internal relative imports were
  emitted without file extensions (`./plugin`), which bun and bundlers resolve
  but plain Node does not (`ERR_MODULE_NOT_FOUND`). Imports now carry explicit
  `.js` extensions and the build uses `NodeNext` module resolution.

### Added

- `TenancyClientConfig.locale` now accepts a getter (`() => string`) evaluated
  per request, for i18n runtimes where the active locale changes without
  recreating the auth client (e.g. paraglide's `getLocale()`).
- `tenancyClient` returns a precise object type instead of the bare
  `BetterAuthClientPlugin` interface: better-auth infers the typed
  `authClient.tenancy.*` actions from the plugin shape, and a plugin widened to
  the bare interface breaks the whole client's action inference in better-auth
  1.7.x.

## 3.0.0

### Breaking

- **`GET /tenancy/member/:id` (`getMember`)** now returns a reduced `user`
  projection `{ id, name, image }` instead of the full user row. Consumers
  reading other user fields (e.g. `user.email`) must fetch them separately.
  This matches the projection already used by add/list/update member and
  avoids leaking sensitive user fields.

### Added

- **`listPermissionContexts`** endpoint (`GET /tenancy/permission/contexts`,
  client `authClient.tenancy.permission.listPermissionContexts`): lists the
  organizations/teams a user has access to, with `parentType`/`parentId`
  hierarchy. Self-only by default; the `endpoints.permission.contexts` hook is
  the admin override for cross-user lookups. Optional `statementId` filters to
  contexts where that permission resolves to allowed.
- OpenAPI `200`/`201`/`204` response schemas documented for every endpoint.
