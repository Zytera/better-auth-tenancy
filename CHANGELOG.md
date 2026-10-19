# Changelog

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
