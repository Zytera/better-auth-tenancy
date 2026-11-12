# @zytera/better-auth-tenancy

> Database-agnostic hierarchical permission system for Better Auth with RBAC, statement-level control, and organization management.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Client Usage](#client-usage)
- [Examples](#examples)

## Overview

Better Auth Tenancy is a production-ready Better Auth plugin that provides enterprise-grade hierarchical permission management. It implements a hybrid RBAC model combining role-based access control with statement-level granular permissions, similar to Google Cloud IAM.

### Key Features

- **Unlimited nesting hierarchy**: Organizations → Teams → Teams → ... (no depth limit)
- **Dynamic roles**: Create custom roles at runtime without code changes
- **Statement-based permissions**: Fine-grained permissions like `team:create`, `member:add`
- **Explicit grants/denies**: Override role permissions at user level (deny-first policy)
- **Temporal permissions**: Set expiration dates for temporary access
- **Multi-language support**: i18n for permission names, descriptions, and error messages (English/Spanish built-in)
- **Metadata validation**: Custom Zod schemas to validate metadata fields with required fields support
- **Invitation system**: Built-in invitation workflow with multiple delivery methods
- **Action hooks**: Execute business logic with automatic rollback on errors (user creation, member addition, etc.)
- **Audit hooks**: Track all permission and entity changes (logging/monitoring only)
- **Cache integration**: Configurable caching for high performance
- **Database-agnostic**: Works with any Better Auth database adapter
- **Universal client**: Single import works seamlessly in web and React Native/Expo
- **Permission filtering hooks**: Filter resources based on user permissions (organizations, teams, members)
- **Type-safe API**: Full TypeScript support with automatic endpoint inference

## Features

### Hierarchical Organizations

```
Organization (Root)
    ├── Team A
    │   ├── Team A1 (child of A)
    │   │   └── Team A1a (child of A1)
    │   └── Team A2 (child of A)
    └── Team B
        └── Team B1 (child of B)
```

- Unlimited organizations per installation
- Unlimited nesting depth (configurable via `maxNestingDepth`)
- Configurable limits (teams per org, child teams per team)
- Members can belong to multiple contexts with different roles

### Hybrid RBAC Model

**Three permission layers:**

1. **Roles**: Collections of statements (e.g., "Editor" role has `content:edit`, `content:publish`)
2. **Grants**: Explicit permission additions (temporary or permanent)
3. **Denies**: Explicit permission denials (always wins)

**Evaluation order (highest to lowest priority):**

```
1. DENY (permission explicitly denied)
2. GRANT (permission explicitly granted)
3. ROLE (permission from assigned role)
4. DEFAULT (no permission)
```

### Statement-Level Control

Define granular permissions:

```typescript
// Define statements
await authClient.tenancy.statement.create({
  id: 'team:delete',
})

// Create role with statements
await authClient.tenancy.role.create({
  name: 'Team Manager',
  contextType: 'team',
  contextId: teamId,
  statements: ['team:create', 'team:delete', 'member:add'],
})
```

### Temporary Permissions

Grant time-limited access:

```typescript
await authClient.tenancy.permission.grant({
  userId,
  statementId: 'billing:manage',
  contextType: 'organization',
  contextId: orgId,
  expiresAt: new Date('2024-12-31')
})
```

### Invitation System

Built-in invitation workflow:

```typescript
const invitation = await authClient.tenancy.invitation.create({
  identifier: 'user@example.com',
  contextType: 'team',
  contextId: teamId,
  roleId: editorRoleId,
  expiresInHours: 72,
  generateCode: true // short code for manual entry
})

await authClient.tenancy.invitation.accept({
  token: invitation.token
})
```

When `generateCode: true`, the invitation also carries a short code for manual
entry (e.g. shared over SMS/phone): 8 characters from an unambiguous
32-character alphabet (A-H J-N P-Z 2-9; `I`/`O`/`0`/`1` are excluded so codes
can be read aloud and typed without confusion), generated with a CSPRNG —
32⁸ = 2⁴⁰ ≈ 1.1 × 10¹² combinations. The long link/QR `token` (64 hex chars)
is generated separately with `crypto.randomBytes`. Codes created by plugin
versions before 4.1.0 used a 6-character format and are rejected by the
`by-code` and `accept` endpoints (re-issue those invitations).

### Internationalization (i18n)

Full multi-language support with automatic locale detection and error messages:

#### Client-Side Locale

```typescript
// Universal client with locale preference
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

const client = createAuthClient({
  baseURL: '/api/auth',
  plugins: [
    tenancyClient({ locale: 'es' }) // Spanish
  ]
})

// All requests automatically include Accept-Language: es header
```

The API automatically selects the best translation based on the `Accept-Language` header following standard HTTP content negotiation rules.

#### Server-Side Error Messages

All error messages support internationalization with automatic locale detection:

```typescript
// Server configuration
tenancy({
  i18n: {
    defaultLocale: 'es',  // Default to Spanish if no Accept-Language header

    // Custom error message translations (optional)
    errorMessages: {
      en: {
        'role.not_found': 'Role not found',
        'member.limit_reached': 'Member limit reached'
      },
      es: {
        'role.not_found': 'Rol no encontrado',
        'member.limit_reached': 'Límite de miembros alcanzado'
      },
      fr: {
        'role.not_found': 'Rôle introuvable',
        'member.limit_reached': 'Limite de membres atteinte'
      }
    }
  }
})
```

**Built-in translations (English and Spanish):**
- Role errors: `role.not_found`, `role.already_exists`, `role.limit_reached`, `role.delete.in_use_members`
- Statement errors: `statement.not_found`, `statement.already_exists`, `statement.delete.in_use_roles`
- Member errors: `member.not_found`, `member.limit_reached`
- Organization errors: `organization.not_found`, `organization.slug_exists`
- Team errors: `team.not_found`, `team.slug_exists`, `team.limit_reached`, `team.nesting_depth_exceeded`
- Invitation errors: `invitation.not_found`, `invitation.expired`, `invitation.already_accepted`

**How it works:**
1. The API extracts the ISO alpha-2 language code from the `Accept-Language` header
2. Falls back to `defaultLocale` (if configured) or `'en'` if no header is present
3. Checks custom error messages first, then built-in translations
4. Always falls back to English if translation is not found

**Message interpolation:**
Error messages support parameter interpolation with `{{variable}}` syntax:

```typescript
// Message template
'role.delete.in_use_members': 'Cannot delete role assigned to {{count}} member(s)'

// Usage (automatic)
throw new APIError('BAD_REQUEST', {
  message: getErrorMessage(
    'role.delete.in_use_members',
    locale,
    { count: 5 },  // Parameters
    customMessages
  )
})

// Result: "Cannot delete role assigned to 5 member(s)"
```

### Metadata Validation

All entities (organizations, teams, members, invitations) include an optional `metadata` field that accepts any JSON data. You can define custom Zod schemas to validate metadata fields, and Better Auth will automatically validate them on create/update operations.

**Why use metadata validation?**
- Enforce required custom fields (e.g., `country`, `department`)
- Type-safe metadata with automatic TypeScript inference
- Native Better Auth validation (no manual checks needed)
- Consistent API error messages for invalid data

**Server configuration:**

```typescript
import { z } from 'zod'

tenancy({
  schemas: {
    organization: {
      metadata: z.object({
        country: z.string().min(2, 'Country code required'),  // Required field
        industry: z.string().optional(),                       // Optional field
        employeeCount: z.number().positive().optional()
      })
    },
    team: {
      metadata: z.object({
        department: z.string(),
        budget: z.number().optional()
      })
    },
    member: {
      metadata: z.object({
        startDate: z.string(),
        position: z.string().optional()
      })
    },
    invitation: {
      metadata: z.object({
        inviterNote: z.string().optional(),
        customMessage: z.string().optional()
      })
    }
  }
})
```

**Usage example:**

```typescript
// Valid - includes required fields
await authClient.tenancy.organization.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
  metadata: {
    country: 'ES',
    industry: 'Technology',
    employeeCount: 150
  }
})

// Invalid - missing required 'country' field
await authClient.tenancy.organization.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
  metadata: {
    industry: 'Technology'  // Error: Country code required
  }
})

// Valid - metadata is optional
await authClient.tenancy.organization.create({
  name: 'Simple Org',
  slug: 'simple-org'
  // No metadata provided - this is fine
})
```

**How it works:**
1. Define Zod schemas in the `schemas` configuration
2. Better Auth automatically validates metadata when creating/updating entities
3. Invalid data returns a validation error before hitting the database
4. If no custom schema is provided, metadata accepts any JSON (`Record<string, unknown>`)

### Permission Filtering Hooks

Filter resources based on user permissions:

```typescript
// Server-side configuration
tenancy({
  permissionFiltering: {
    // Filter organizations user can access
    filterOrganizations: async (userId, organizations) => {
      return organizations.filter(org =>
        await hasPermission(userId, 'org:view', 'organization', org.id)
      )
    },

    // Filter teams by parent context
    filterTeams: async (ctx, teams, { parentType, parentId }) => {
      return teams.filter(team =>
        await hasPermission(userId, 'team:view', 'team', team.id)
      )
    },

    // Filter members by context
    filterOrganizationMembers: async (ctx, members, { organizationId }) => {
      // Custom filtering logic
      return members
    },

    // Filter team members
    filterTeamMembers: async (ctx, members, { teamId, parentType, parentId }) => {
      // Custom filtering logic
      return members
    }
  }
})
```

## Architecture

### Permission Evaluation Flow

```
User requests action
    |
1. Check explicit DENY
    |-- Found -> DENY
    |-- Not found -> Continue
    |
2. Check explicit GRANT
    |-- Found -> ALLOW
    |-- Not found -> Continue
    |
3. Check ROLE statements
    |-- Found in role -> ALLOW
    |-- Not found -> Continue
    |
4. Walk up hierarchy (team -> parent team -> ... -> organization)
    |-- Repeat steps 1-3 at each level
    |-- Found -> Return result
    |-- Reached organization with no match -> DENY
```

### Hierarchy Precedence

When checking permissions, the system walks up the hierarchy from the most specific context to the organization root:

1. **Current team** (most specific)
2. **Parent team** (if parent is a team)
3. **Grandparent team**, etc. (unlimited depth)
4. **Organization** (root context)

Permissions are evaluated at each level following the Deny > Grant > Role priority. The first match wins.

Example: User is `admin` of Team "Engineering" but `viewer` of child Team "DevOps":
- In Team "DevOps": Has `viewer` permissions only
- In other child teams of "Engineering": Inherits `admin` permissions

### Database Design

Uses Better Auth's native schema system:

```typescript
// Works with any Better Auth database adapter
export const auth = betterAuth({
  database: yourAdapter, // Prisma, Drizzle, Kysely, MongoDB, etc.
  plugins: [
    tenancy()  // Automatically creates tables
  ]
})
```

Better Auth handles table creation automatically - no manual migrations needed.

### Field Naming: `parentType`/`parentId` vs `contextType`/`contextId`

The codebase uses two different polymorphic field pairs intentionally. They represent different relationships:

| Fields | Used by | Meaning |
|--------|---------|---------|
| `contextType`/`contextId` | member, role, permissionGrant, permissionDeny, invitation | "This entity **belongs to** / **operates within** this context" |
| `parentType`/`parentId` | team | "This entity **is a child of** this parent" |

**Why not unify them?** The team's relationship to its parent is **hierarchical** (parent-child), while all other models have a **scoping** relationship (the entity exists within a context). Using `parentType`/`parentId` for teams makes the hierarchical nature explicit:

```typescript
// Immediately clear: this team's parent is the organization
team.create({ parentType: 'organization', parentId: orgId })

// Immediately clear: this member belongs to the organization context
member.add({ contextType: 'organization', contextId: orgId })
```

The distinction also avoids ambiguity in the `team` model, where `contextType`/`contextId` could be misread as "the context this team represents" rather than "the context this team lives under".

## Installation

```bash
bun add @zytera/better-auth-tenancy better-auth
# or
npm install @zytera/better-auth-tenancy better-auth
# or
pnpm add @zytera/better-auth-tenancy better-auth
# or
yarn add @zytera/better-auth-tenancy better-auth
```

### Prerequisites

- **Bun**: >=1.0.0 (or Node.js >=18.0.0)
- **Better Auth**: >=1.4.5 (minimum peer, see the changelog for #33; the plugin is tested against the floor and the latest 1.x release)
- **Database**: Any supported by Better Auth
- **React Native/Expo**: @better-auth/expo for mobile support

### Import Paths

**Server-side (Better Auth plugin):**
```typescript
import { tenancy } from '@zytera/better-auth-tenancy/server'
import type { TenancyConfig } from '@zytera/better-auth-tenancy/server'
```

**Client-side (Universal - works in Web and React Native/Expo):**
```typescript
import { tenancyClient } from '@zytera/better-auth-tenancy/client'
```

**Shared types:**
```typescript
import type { Organization, Statement, Team } from '@zytera/better-auth-tenancy'
```

### Platform Support

Works everywhere JavaScript runs:
- **Web**: Astro, Next.js, SvelteKit, Remix, Vite, vanilla JS
- **Mobile**: React Native, Expo (with @better-auth/expo)
- **Server**: Bun (recommended), Node.js, Deno
- **Edge**: Cloudflare Workers, Vercel Edge, Deno Deploy

## Quick Start

### 1. Configure Better Auth (Server)

```typescript
import { betterAuth } from 'better-auth'
import { tenancy } from '@zytera/better-auth-tenancy/server'

export const auth = betterAuth({
  database: {
    // Your database configuration
    // Supports: Prisma, Drizzle, Kysely, MongoDB, etc.
  },
  plugins: [
    tenancy({
      // REQUIRED: endpoint authorization hooks.
      //
      // The plugin is FAIL-CLOSED by default:
      //   - Write endpoints (create/update/delete/grant/...) reject every
      //     request with 403 until you configure a hook for them.
      //   - Read endpoints require an authenticated session (401 for
      //     anonymous callers) until you configure a hook for them.
      //
      // A configured hook fully replaces the default and must throw to deny.
      endpoints: {
        organization: {
          create: async ({ session }) => {
            // e.g. require a global admin role or a plan check
            if (!session?.user) throw new Error('Forbidden')
          },
          delete: async ({ session, ctx }) => {
            // e.g. only the owner may delete, checking ctx.body.id
          },
          read: async ({ session }) => {
            // omit or narrow: by default reads require a session only
          },
        },
        member: {
          add: async ({ session, ctx }) => {
            // e.g. check an admin membership of ctx.body.contextId
          },
        },
        invitation: {
          // Token-based flows (accept/reject/getByToken) may be no-ops when
          // the token itself is the credential — but the hook is still
          // required, otherwise the endpoint fails closed with 403.
          accept: async () => {},
          decline: async () => {},
        },
        permission: {
          grant: async ({ session, ctx }) => {
            // CRITICAL: without a hook this endpoint fails closed; with a
            // permissive one, validate who may grant permissions!
          },
        },
      },

      // Optional: Cache hooks for Redis
      cache: {
        async get(key: string) {
          return redis.get(key)
        },
        async set(key: string, value: any, ttl: number) {
          await redis.set(key, JSON.stringify(value), 'EX', ttl)
        },
        async invalidate(pattern: string) {
          const keys = await redis.keys(pattern)
          if (keys.length > 0) await redis.del(...keys)
        },
      },

      // Optional: Action hooks - business logic with automatic rollback
      actions: {
        async onInvitationAccepted(event, ctx) {
          // Create user and add as member
          const adapter = ctx.context.adapter
          const user = await adapter.create({
            model: 'user',
            data: { email: event.identifier }
          })
          await adapter.create({
            model: 'member',
            data: {
              userId: user.id,
              contextType: event.contextType,
              contextId: event.contextId,
              roleId: event.roleId
            }
          })
          // If fails, invitation status reverts to 'pending' automatically
        },
      },

      // Optional: Audit hooks - logging only
      audit: {
        async onEntityCreated(event) {
          console.log('Entity created:', event)
        },
        async onPermissionGranted(event) {
          console.log('Permission granted:', event)
        },
        async onInvitationAccepted(event) {
          console.log('Invitation accepted:', event)
        },
      },

      // Optional: Permission filtering
      permissionFiltering: {
        filterOrganizations: async (userId, organizations) => {
          // Custom filtering logic
          return organizations
        },
      },

      // Optional: Hierarchy limits
      limits: {
        maxTeamsPerOrganization: 100,
        maxChildTeamsPerTeam: 50,
        maxMembersPerOrganization: 10000,

        // maxNestingDepth controls how deep teams can nest.
        // The value represents the total hierarchy levels (org counts as 1):
        //
        //   maxNestingDepth: 2  ->  org -> team (only)
        //   maxNestingDepth: 3  ->  org -> team -> subteam
        //   maxNestingDepth: 4  ->  org -> team -> subteam -> sub-subteam
        //   undefined           ->  unlimited nesting
        //
        maxNestingDepth: 3, // Classic 3-tier: org -> team -> subteam
      },

      // Optional: Invitation settings
      invitation: {
        defaultExpirationHours: 72, // 3 days
      },

      // Optional: i18n configuration
      i18n: {
        defaultLocale: 'en',  // Used when Accept-Language header is missing

        // Custom error message translations (optional)
        errorMessages: {
          es: {
            'role.not_found': 'Rol no encontrado personalizado',
            'member.limit_reached': 'Límite de miembros alcanzado'
          }
        }
      },

      // Optional: Metadata validation schemas
      schemas: {
        organization: {
          metadata: z.object({
            country: z.string().min(2, 'Country code required'),
            industry: z.string().optional(),
            employeeCount: z.number().positive().optional()
          })
        },
        team: {
          metadata: z.object({
            department: z.string(),
            budget: z.number().optional()
          })
        },
        member: {
          metadata: z.object({
            startDate: z.string(),
            position: z.string().optional()
          })
        },
        invitation: {
          metadata: z.object({
            inviterNote: z.string().optional(),
            customMessage: z.string().optional()
          })
        }
      },
    }),
  ],
})
```

### 2. Setup Client (Universal)

The client works in both web and React Native/Expo environments:

**Web (Browser):**
```typescript
import { createAuthClient } from 'better-auth/clients'
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

export const authClient = createAuthClient({
  baseURL: '/api/auth',
  plugins: [
    tenancyClient({
      locale: 'es', // Optional i18n
      fetchOptions: {
        credentials: 'include' // Send cookies automatically
      }
    })
  ]
})
```

**React Native/Expo:**
```typescript
import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/clients'
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

export const authClient = createAuthClient({
  baseURL: 'https://api.example.com/api/auth',
  plugins: [
    expoClient(),               // Handles session with SecureStore
    tenancyClient({ locale: 'es' })
  ]
})
```

### 3. Database Tables

Better Auth automatically creates tables on first run. No manual migrations needed.

### 4. Create Your First Organization

```typescript
// Create organization
const org = await authClient.tenancy.organization.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
})

// Create statements
await authClient.tenancy.statement.create({ id: 'team:create' })
await authClient.tenancy.statement.create({ id: 'team:delete' })

// Create organization role
const adminRole = await authClient.tenancy.role.create({
  name: 'Admin',
  contextType: 'organization',
  contextId: org.id,
  statements: ['team:create', 'team:delete'],
})

// Add member with role
await authClient.tenancy.member.add({
  userId: newUserId,
  contextType: 'organization',
  contextId: org.id,
  roleId: adminRole.id,
})
```

## Core Concepts

### Statements

Statements are the atomic units of permission. They represent a single action on a resource.

**Format**: `category:operation`

**Examples**:
- `organization:create`
- `team:update`
- `member:remove`
- `billing:view`

**Creating statements**:

```typescript
await authClient.tenancy.statement.create({
  id: 'document:publish',
})
```

### Roles

Roles are collections of statements that can be assigned to users.

**Two types**:
1. **Organization roles**: Apply to organization context
2. **Team roles**: Apply to team context (custom per team, at any nesting level)

**Creating roles**:

```typescript
// Organization role
await authClient.tenancy.role.create({
  name: 'Billing Manager',
  description: 'Manages billing and subscriptions',
  contextType: 'organization',
  contextId: orgId,
  statements: [
    'billing:view',
    'billing:update',
    'subscription:manage',
  ],
})

// Team custom role (works at any nesting level)
await authClient.tenancy.role.create({
  name: 'Content Editor',
  description: 'Can edit and publish content',
  contextType: 'team',
  contextId: teamId,
  statements: [
    'content:create',
    'content:edit',
    'content:publish',
  ],
})
```

### Teams (Unlimited Nesting)

Teams use `parentType`/`parentId` to reference their parent, enabling unlimited nesting:

```typescript
// Top-level team (parent is an organization)
const engineering = await authClient.tenancy.team.create({
  parentType: 'organization',
  parentId: org.id,
  name: 'Engineering',
  slug: 'engineering',
})

// Nested team (parent is another team)
const frontend = await authClient.tenancy.team.create({
  parentType: 'team',
  parentId: engineering.id,
  name: 'Frontend',
  slug: 'frontend',
})

// Deeply nested team (parent is also a team)
const react = await authClient.tenancy.team.create({
  parentType: 'team',
  parentId: frontend.id,
  name: 'React',
  slug: 'react',
})
```

### Members

Members represent users assigned to contexts with specific roles.

```typescript
// Add to organization
await authClient.tenancy.member.add({
  userId: user.id,
  contextType: 'organization',
  contextId: org.id,
  roleId: adminRoleId,
})

// Add to team with custom role
await authClient.tenancy.member.add({
  userId: user.id,
  contextType: 'team',
  contextId: team.id,
  roleId: editorRoleId,
})
```

### Permission Checking

Check if a user has permission:

```typescript
const result = await authClient.tenancy.permission.check({
  userId: user.id,
  statementId: 'team:delete',
  contextType: 'team',
  contextId: team.id,
})

if (result.allowed) {
  // User has permission
  await deleteTeam(team.id)
}
```

The permission check automatically walks up the hierarchy (team -> parent team -> ... -> organization) if no explicit permission is found at the current level.

### Grants and Denies

Override role-based permissions:

```typescript
await authClient.tenancy.permission.grant({
  userId: user.id,
  statementId: 'deploy:production',
  contextType: 'team',
  contextId: team.id,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
})

await authClient.tenancy.permission.deny({
  userId: user.id,
  statementId: 'sensitive:data',
  contextType: 'organization',
  contextId: org.id
})
```

## API Reference

### Client Methods

All methods are exposed through `getActions` with a RESTful domain.action structure:

```typescript
// Organizations
authClient.tenancy.organization.create({ name, slug, metadata? })
authClient.tenancy.organization.get({ id })
authClient.tenancy.organization.getBySlug({ slug })
authClient.tenancy.organization.update({ id, name?, slug?, metadata? })
authClient.tenancy.organization.delete({ id })
authClient.tenancy.organization.list({ limit?, offset?, orderBy?, orderDirection? })

// Teams (unlimited nesting via parentType/parentId)
authClient.tenancy.team.create({ parentType, parentId, name, slug, metadata? })
authClient.tenancy.team.get({ id })
authClient.tenancy.team.getBySlug({ parentType, parentId, slug })
authClient.tenancy.team.update({ id, name?, slug?, metadata? })
authClient.tenancy.team.delete({ id })
authClient.tenancy.team.list({ parentType, parentId, limit?, offset?, orderBy?, orderDirection? })

// Statements (createdBy is automatically set from authenticated user)
authClient.tenancy.statement.create({ id })
authClient.tenancy.statement.get({ id })
authClient.tenancy.statement.update({ id, category?, operation? })
authClient.tenancy.statement.delete({ id })
authClient.tenancy.statement.list({ limit?, offset?, orderBy?, orderDirection? })
authClient.tenancy.statement.batchCreate({ statements })

// Roles (addedBy, removedBy are automatically set from authenticated user)
authClient.tenancy.role.create({ name, contextType, contextId, statements?, description? })
authClient.tenancy.role.get({ id })
authClient.tenancy.role.update({ id, name?, description? })
authClient.tenancy.role.delete({ id })
authClient.tenancy.role.list({ contextType, contextId, limit?, offset?, orderBy?, orderDirection? })
authClient.tenancy.role.addStatement({ id, statementId })
authClient.tenancy.role.removeStatement({ id, statementId })

// Members (updatedBy, removedBy are automatically set from authenticated user)
authClient.tenancy.member.add({ userId, contextType, contextId, roleId?, metadata? })
authClient.tenancy.member.get({ id })
authClient.tenancy.member.updateRole({ id, roleId })
authClient.tenancy.member.updateMetadata({ id, metadata })
authClient.tenancy.member.remove({ id })
authClient.tenancy.member.list({ contextType, contextId, limit?, offset?, orderBy?, orderDirection? })
authClient.tenancy.member.getUserMemberships({ userId, contextType?, limit?, offset? })
authClient.tenancy.member.check({ userId, contextType, contextId })

// Permissions (grantedBy, deniedBy, revokedBy are automatically set from authenticated user)
authClient.tenancy.permission.grant({ userId, statementId, contextType, contextId, expiresAt? })
authClient.tenancy.permission.deny({ userId, statementId, contextType, contextId })
authClient.tenancy.permission.revoke({ permissionId, type })
authClient.tenancy.permission.check({ userId, statementId, contextType, contextId })
authClient.tenancy.permission.listGrants({ userId, limit?, offset? })
authClient.tenancy.permission.listDenies({ userId, limit?, offset? })
authClient.tenancy.permission.grantBatch({ grants })
authClient.tenancy.permission.denyBatch({ denies })

// Invitations (invitedBy, cancelledBy are automatically set from authenticated user)
authClient.tenancy.invitation.create({ identifier?, contextType, contextId, roleId?, expiresInHours?, generateCode?, metadata? })
authClient.tenancy.invitation.accept({ token, metadata? })
authClient.tenancy.invitation.reject({ token })
authClient.tenancy.invitation.cancel({ token })
authClient.tenancy.invitation.getByToken({ token })
authClient.tenancy.invitation.getByCode({ code })
authClient.tenancy.invitation.list({ contextType, contextId, limit?, offset?, status?, orderBy?, orderDirection? })
authClient.tenancy.invitation.getByIdentifier({ identifier })
authClient.tenancy.invitation.cleanupExpired()
```

### Endpoint Structure

All endpoints follow Better Auth conventions:
- **Prefix**: All routes use `/tenancy/` prefix
- **Methods**: Only POST (for mutations) and GET (for queries)
- **Parameters**: IDs and data in request body for POST, query params for GET
- **Authentication**: Session-based via cookies or Bearer tokens

## Database Schema

Better Auth Tenancy uses a unified model design:

### Core Tables
- `organization` - Root entities
- `team` - Hierarchical grouping (unlimited nesting via `parentType`/`parentId`)

### Permission Tables
- `statement` - Permission catalog
- `statementTranslation` - i18n support
- `role` - Unified roles (organization and team roles in one table)
- `roleStatement` - Role-statement mapping

### Member Tables
- `member` - Unified members (organization and team members in one table)

### Permission Override Tables
- `permissionGrant` - Explicit grants (with optional expiration)
- `permissionDeny` - Explicit denies

### Utility Tables
- `invitation` - Invitation system

Better Auth automatically creates these tables on first run.

## Client Usage

### Universal Client with Automatic Type Inference

The plugin provides a **universal client** that uses `$InferServerPlugin` to automatically infer all endpoints and types from the server. This works seamlessly in both web and React Native/Expo environments:

```typescript
import { tenancyClient } from '@zytera/better-auth-tenancy/client'
```

#### Web/Browser

```typescript
import { createAuthClient } from 'better-auth/react'
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

const authClient = createAuthClient({
  baseURL: '/api/auth',
  plugins: [
    tenancyClient({
      locale: 'es' // Optional: Add Accept-Language header
    })
  ]
})

// All methods are exposed through getActions!
await authClient.tenancy.organization.create({
  name: 'My Org',
  slug: 'my-org'
})
```

**Features:**
- Automatic type inference from server plugin
- Accept-Language header support for i18n
- Full TypeScript autocomplete
- Works in all modern browsers

#### React Native/Expo

```typescript
import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

const authClient = createAuthClient({
  baseURL: 'https://api.example.com/api/auth',
  plugins: [
    expoClient(),               // Required for session management
    tenancyClient({ locale: 'es' })
  ]
})

// Same API as web!
await authClient.tenancy.team.create({
  parentType: 'organization',
  parentId: 'org-id',
  name: 'My Team',
  slug: 'my-team'
})
```

**Features:**
- Works with @better-auth/expo
- SecureStore integration via expoClient
- Automatic type inference
- Accept-Language header support

### Configuration Options

```typescript
interface TenancyClientConfig {
  /**
   * Preferred locale for i18n (e.g., 'en', 'es', 'fr')
   * Adds the Accept-Language header to all requests
   */
  locale?: string
}
```

### How It Works

The client uses `getActions` to provide a clean, RESTful API structure. All methods are organized by domain:

- Organizations: `authClient.tenancy.organization.create()`, `.get()`, `.list()`
- Teams: `authClient.tenancy.team.create()`, `.get()`, `.list()`
- Members: `authClient.tenancy.member.add()`, `.get()`, `.list()`
- Permissions: `authClient.tenancy.permission.grant()`, `.deny()`, `.check()`

## Examples

### Example 1: Multi-tenant SaaS Application

```typescript
// Setup for "Acme Corp" tenant
const org = await authClient.tenancy.organization.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
})

// Create departments as teams
const engineering = await authClient.tenancy.team.create({
  parentType: 'organization',
  parentId: org.id,
  name: 'Engineering',
  slug: 'engineering',
})

// Create nested teams (unlimited depth)
const frontend = await authClient.tenancy.team.create({
  parentType: 'team',
  parentId: engineering.id,
  name: 'Frontend',
  slug: 'frontend',
})

// Define permissions
await authClient.tenancy.statement.create({ id: 'code:commit' })
await authClient.tenancy.statement.create({ id: 'code:review' })

// Create role
const seniorEngineer = await authClient.tenancy.role.create({
  name: 'Senior Engineer',
  contextType: 'team',
  contextId: engineering.id,
  statements: ['code:commit', 'code:review'],
})

// Add team member
await authClient.tenancy.member.add({
  userId: developerId,
  contextType: 'team',
  contextId: engineering.id,
  roleId: seniorEngineer.id,
})
```

### Example 2: Invitation Workflow

```typescript
const invitation = await authClient.tenancy.invitation.create({
  identifier: 'newdev@example.com',
  contextType: 'team',
  contextId: engineeringTeamId,
  roleId: developerRoleId,
  expiresInHours: 72
})

// Send email with invitation link
await sendEmail({
  to: 'newdev@example.com',
  subject: 'Invitation to join Engineering team',
  body: `Click here to accept: ${APP_URL}/accept-invitation/${invitation.token}`,
})

// When user accepts
await authClient.tenancy.invitation.accept({
  token: invitation.token
})

// Cleanup expired invitations (run as cron job)
await authClient.tenancy.invitation.cleanupExpired()
```

### Example 3: Deep Team Nesting

```typescript
// Organization
const org = await authClient.tenancy.organization.create({
  name: 'Global Corp', slug: 'global-corp'
})

// Region (top-level team)
const americas = await authClient.tenancy.team.create({
  parentType: 'organization', parentId: org.id,
  name: 'Americas', slug: 'americas'
})

// Country (nested team)
const usa = await authClient.tenancy.team.create({
  parentType: 'team', parentId: americas.id,
  name: 'United States', slug: 'usa'
})

// Office (deeply nested team)
const nyc = await authClient.tenancy.team.create({
  parentType: 'team', parentId: usa.id,
  name: 'New York Office', slug: 'nyc'
})

// Department (even deeper)
const nycEngineering = await authClient.tenancy.team.create({
  parentType: 'team', parentId: nyc.id,
  name: 'Engineering', slug: 'engineering'
})

// Permission check walks up: nycEngineering -> nyc -> usa -> americas -> org
const result = await authClient.tenancy.permission.check({
  userId: user.id,
  statementId: 'budget:approve',
  contextType: 'team',
  contextId: nycEngineering.id,
})
```

### Example 4: React Native/Expo App

```typescript
import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import { tenancyClient } from '@zytera/better-auth-tenancy/client'
import { getLocales } from 'expo-localization'

// Create auth client
const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_AUTH_URL,
  plugins: [
    expoClient(),
    tenancyClient({
      locale: getLocales()[0]?.languageCode || 'en'
    })
  ]
})

// Use in your app
function App() {
  const [orgs, setOrgs] = useState([])

  useEffect(() => {
    async function loadOrgs() {
      const result = await authClient.tenancy.organization.list()
      setOrgs(result.items)
    }
    loadOrgs()
  }, [])

  return (
    <View>
      {orgs.map(org => (
        <Text key={org.id}>{org.name}</Text>
      ))}
    </View>
  )
}
```

## Security Best Practices

1. **Configure endpoint authorization hooks (`endpoints`)**. The plugin fails closed by default: write endpoints return `403` for every request and read endpoints require an authenticated session (`401`) until a hook is configured for them. A missing hook is a configuration error, never an implicit "any authenticated user can do this". Audit your `endpoints` config at startup — the plugin logs a warning when no hooks are configured at all. The permission oracle (`permission/check`, `permission/grants`, `permission/denies`) additionally only lets authenticated callers query **themselves**: queries about another user need the `permission.check` / `permission.listGrants` / `permission.listDenies` hook (`403` otherwise).
2. **Always use HTTPS in production**
3. **Validate user input** on the server side
4. **Use deny rules** for sensitive permissions
5. **Set expiration dates** for temporary permissions
6. **Use action hooks** for critical business logic (user creation, member addition) with automatic rollback
7. **Use audit hooks** for logging and monitoring permission changes
8. **Implement rate limiting** on invitation endpoints. The plugin does not rate limit; this is the consumer's responsibility at the edge/gateway, same as for the other endpoints. Prioritize `invitation/by-code/:code` and `invitation/accept` (throttle **per code and per IP**): the short code is a credential for manual entry, and without throttling an attacker can brute-force it online. The codes themselves are CSPRNG-generated over 32⁸ ≈ 1.1 × 10¹² combinations (#30), which makes brute force impractical at any realistic throttled rate.
9. **Use environment variables** for sensitive configuration
10. **Set `maxNestingDepth`** to prevent excessive hierarchy depth

## Development

### Development Setup

```bash
# Clone repository
git clone https://github.com/zytera/better-auth-tenancy.git
cd better-auth-tenancy

# Install dependencies
bun install

# Build
bun run build

# Run type check
bun run typecheck
```

### Scripts

```bash
bun run build      # Build the package
bun run dev        # Watch mode
bun run typecheck  # Type checking
bun run lint       # Lint code
bun run test       # Run tests
```

## Support

- Issues: [GitHub Issues](https://github.com/zytera/better-auth-tenancy/issues)
- Documentation: [Full Docs](https://github.com/zytera/better-auth-tenancy/docs)


## Acknowledgments

- [Better Auth](https://github.com/better-auth/better-auth) - Authentication framework
- [Expo](https://expo.dev) - Mobile framework
- [Bun](https://bun.sh) - JavaScript runtime

---

**Version**: 1.0.0
**Author**: Zytera
**Keywords**: better-auth, auth, authorization, permissions, rbac, access-control, organizations, teams, multi-tenant, tenancy, workspace, saas
