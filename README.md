# @zytera/better-auth-tenancy

> Database-agnostic hierarchical permission system for Better Auth with RBAC, statement-level control, and organization management.

## 📋 Table of Contents

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

## 🌟 Overview

Better Auth Tenancy is a production-ready Better Auth plugin that provides enterprise-grade hierarchical permission management. It implements a hybrid RBAC model combining role-based access control with statement-level granular permissions, similar to Google Cloud IAM.

### Key Features

- **Three-level hierarchy**: Organizations → Teams → Subteams
- **Dynamic roles**: Create custom roles at runtime without code changes
- **Statement-based permissions**: Fine-grained permissions like `team:create`, `member:add`
- **Explicit grants/denies**: Override role permissions at user level
- **Temporal permissions**: Set expiration dates for temporary access
- **Multi-language support**: i18n for permission names and descriptions
- **Invitation system**: Built-in email-based invitation workflow
- **Audit hooks**: Track all permission and entity changes
- **Cache integration**: Configurable caching for high performance
- **Database-agnostic**: Works with any Better Auth database adapter
- **55 REST endpoints**: Complete API out of the box

## ✨ Features

### 🏢 Hierarchical Organizations

```
Organization (Root)
    ├── Team A
    │   ├── Subteam A1
    │   └── Subteam A2
    └── Team B
        └── Subteam B1
```

- Unlimited organizations per installation
- Configurable hierarchy limits (teams per org, subteams per team)
- Members can belong to multiple contexts with different roles

### 🔐 Hybrid RBAC Model

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

### 🎯 Statement-Level Control

Define granular permissions:

```typescript
// Define statements
await client.statements.create({
  id: 'subteam:delete',
  createdBy: userId
})

// Create role with statements
await client.roles.create({
  name: 'Team Manager',
  contextType: 'team',
  contextId: teamId,
  statements: ['subteam:create', 'subteam:delete', 'member:add'],
  createdBy: userId
})
```

### ⏰ Temporary Permissions

Grant time-limited access:

```typescript
await client.permissions.grant({
  userId,
  statementId: 'billing:manage',
  contextType: 'organization',
  contextId: orgId,
  expiresAt: new Date('2024-12-31'), // Expires on this date
  grantedBy: adminId
})
```

### 📧 Invitation System

Built-in invitation workflow:

```typescript
// Create invitation
const invitation = await client.invitations.create({
  email: 'user@example.com',
  contextType: 'team',
  contextId: teamId,
  roleId: editorRoleId,
  invitedBy: adminId,
  expiresInHours: 72
})

// Accept invitation
await client.invitations.accept({
  invitationId: invitation.id,
  userId
})
```

### 🌍 Internationalization (i18n)

Full multi-language support with automatic locale detection:

```typescript
// Create client with locale preference
const client = tenancyClient({
  baseUrl: '/api/auth',
  locale: 'es', // Spanish
})

// Add translations to statements
await client.statements.addTranslation('document:publish', {
  locale: 'es',
  name: 'Publicar Documentos',
  description: 'Publicar documentos a producción'
})

// Get statement (returns Spanish translation automatically)
const statement = await client.statements.get('document:publish')
console.log(statement.translation?.name) // "Publicar Documentos"

// Change locale dynamically
client.setLocale('fr')
```

The API automatically selects the best translation based on the `Accept-Language` header following standard HTTP content negotiation rules. See [I18N.md](./docs/I18N.md) for full documentation.

## 🏗️ Architecture

### Permission Evaluation Flow

```
User requests action
    ↓
1. Check explicit DENY
    ├─ Found → DENY ❌
    └─ Not found → Continue
    ↓
2. Check explicit GRANT
    ├─ Found → ALLOW ✅
    └─ Not found → Continue
    ↓
3. Check ROLE statements
    ├─ Found in role → ALLOW ✅
    └─ Not found → DENY ❌
```

### Hierarchy Precedence

When checking permissions, the system follows the **most specific role** principle:

1. **Subteam role** (most specific)
2. **Team role** (parent context)
3. **Organization role** (root context)

Example: User is `admin` of Team "Engineering" but `member` of Subteam "DevOps":
- In Subteam "DevOps": Has `member` permissions only
- In other subteams: Inherits `admin` permissions from Team

### Database Design

Uses Better Auth's native schema system with polymorphic relationships:

```typescript
// Supports any Better Auth database adapter (Prisma, Drizzle, Kysely, etc.)
export const auth = betterAuth({
  database: yourAdapter, // Works with any adapter
  plugins: [tenancy()]
})
```

## 📦 Installation

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
- **Better Auth**: ^1.0.0
- **Database**: Any supported by Better Auth

### Import Paths

**Server-side (Better Auth plugin):**
```typescript
import { tenancy } from '@zytera/better-auth-tenancy/server'
```

**Client-side (Frontend/Mobile):**
```typescript
import { tenancyClient } from '@zytera/better-auth-tenancy/client'
```

**TypeScript types:**
```typescript
import type { TenancyConfig, Organization } from '@zytera/better-auth-tenancy/server'
import type { TenancyClient } from '@zytera/better-auth-tenancy/client'
```

### Platform Support

Works everywhere JavaScript runs:
- ✅ **Web**: Astro, Next.js, SvelteKit, Remix, Vite, vanilla JS
- ✅ **Mobile**: React Native, Expo (no polyfills needed)
- ✅ **Server**: Bun (recommended), Node.js, Deno
- ✅ **Edge**: Cloudflare Workers, Vercel Edge, Deno Deploy

Built for Bun - uses standard `fetch` API, zero dependencies, universal compatibility.

## 🚀 Quick Start

### 1. Configure Better Auth

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

      // Optional: Audit hooks for logging
      audit: {
        async onEntityCreated(event) {
          console.log('Entity created:', event)
        },
        async onPermissionGranted(event) {
          console.log('Permission granted:', event)
        },
      },

      // Optional: Hierarchy limits
      limits: {
        maxTeamsPerOrganization: 100,
        maxMembersPerOrganization: 10000,
      },

      // Optional: Invitation settings
      invitation: {
        defaultExpirationHours: 72, // 3 days
      },

      // Optional: i18n configuration
      i18n: {
        defaultLocale: 'en',
        supportedLocales: ['en', 'es', 'fr'],
      },
    }),
  ],
})
```

### 2. Run Database Migrations

Better Auth will automatically create the required tables on first run.

### 3. Create Your First Organization

```typescript
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

const client = tenancyClient({
  baseUrl: '/api/auth',
  fetch: window.fetch.bind(window),
})

// Create organization
const org = await client.organizations.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
})

// Create statement
await client.statements.create({
  id: 'team:create',
  createdBy: userId,
})

// Create organization role
const adminRole = await client.roles.create({
  name: 'Admin',
  contextType: 'organization',
  contextId: org.id,
  statements: ['team:create', 'team:delete'],
  createdBy: userId,
})

// Add member with role
await client.members.add({
  userId: newUserId,
  contextType: 'organization',
  contextId: org.id,
  roleId: adminRole.id,
})
```

## 📚 Core Concepts

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
await client.statements.create({
  id: 'document:publish',
  createdBy: userId,
})

// Add translations for i18n
await client.statements.addTranslation('document:publish', {
  locale: 'es',
  name: 'Publicar documentos',
  description: 'Publicar documentos en producción',
})
```

### Roles

Roles are collections of statements that can be assigned to users.

**Two types**:
1. **Organization roles**: Apply to organization context
2. **Team roles**: Apply to team/subteam contexts (custom per team)

**Creating roles**:

```typescript
// Organization role
await client.roles.create({
  name: 'Billing Manager',
  description: 'Manages billing and subscriptions',
  contextType: 'organization',
  contextId: orgId,
  statements: [
    'billing:view',
    'billing:update',
    'subscription:manage',
  ],
  createdBy: userId,
})

// Team custom role
await client.roles.create({
  name: 'Content Editor',
  description: 'Can edit and publish content',
  contextType: 'team',
  contextId: teamId,
  statements: [
    'content:create',
    'content:edit',
    'content:publish',
  ],
  createdBy: userId,
})
```

### Members

Members represent users assigned to contexts with specific roles.

```typescript
// Add to organization
await client.members.add({
  userId: user.id,
  contextType: 'organization',
  contextId: org.id,
  roleId: adminRoleId,
})

// Add to team with custom role
await client.members.add({
  userId: user.id,
  contextType: 'team',
  contextId: team.id,
  roleId: editorRoleId,
})
```

### Permission Checking

Check if a user has permission:

```typescript
const result = await client.permissions.check({
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

### Grants and Denies

Override role-based permissions:

```typescript
// Grant temporary permission (24 hours)
await client.permissions.grant({
  userId: user.id,
  statementId: 'deploy:production',
  contextType: 'team',
  contextId: team.id,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  grantedBy: adminId,
})

// Deny permission (highest priority)
await client.permissions.deny({
  userId: user.id,
  statementId: 'sensitive:data',
  contextType: 'organization',
  contextId: org.id,
  deniedBy: securityOfficerId,
})
```

## 🔌 API Reference

### HTTP Endpoints

Better Auth Tenancy exposes 55 REST endpoints:

#### Organizations (6 endpoints)

```http
POST   /organization/create
GET    /organization/:id
GET    /organization/by-slug/:slug
PATCH  /organization/:id
DELETE /organization/:id
GET    /organization/list
```

#### Teams (6 endpoints)

```http
POST   /team/create
GET    /team/:id
GET    /team/by-slug/:organizationId/:slug
PATCH  /team/:id
DELETE /team/:id
GET    /team/list/:organizationId
```

#### Subteams (5 endpoints)

```http
POST   /subteam/create
GET    /subteam/:id
GET    /subteam/by-slug/:teamId/:slug
PATCH  /subteam/:id
DELETE /subteam/:id
GET    /subteam/list/:teamId
```

#### Roles (7 endpoints)

```http
POST   /role/create
GET    /role/:id
PATCH  /role/:id
DELETE /role/:id
GET    /role/list/:contextType/:contextId
POST   /role/:id/statement
DELETE /role/:id/statement/:statementId
```

#### Statements (6 endpoints)

```http
POST   /statement/create
GET    /statement/:id
PATCH  /statement/:id
DELETE /statement/:id
GET    /statement/list
POST   /statement/batch-create
```

#### Members (8 endpoints)

```http
POST   /member/add
PATCH  /member/role
DELETE /member/remove
GET    /member/list/:contextType/:contextId
POST   /member/bulk-add
GET    /member/check
DELETE /member/bulk-remove
POST   /member/transfer
```

#### Invitations (7 endpoints)

```http
POST   /invitation/create
GET    /invitation/:id
GET    /invitation/by-token/:token
POST   /invitation/:id/accept
POST   /invitation/:id/decline
POST   /invitation/:id/revoke
GET    /invitation/list/:contextType/:contextId
GET    /invitation/by-email/:email
POST   /invitation/cleanup-expired
```

#### Permissions (8 endpoints)

```http
POST   /permission/grant
POST   /permission/deny
POST   /permission/revoke
POST   /permission/check
GET    /permission/grants/:userId
GET    /permission/denies/:userId
POST   /permission/check-batch
DELETE /permission/cleanup/:contextType/:contextId
```

## 🗄️ Database Schema

Better Auth Tenancy uses 15 tables managed by Better Auth:

### Core Tables
- **auth_tenancy_organization** - Root entities
- **auth_tenancy_team** - First-level grouping
- **auth_tenancy_subteam** - Second-level grouping

### Permission Tables
- **auth_tenancy_statement** - Permission catalog
- **auth_tenancy_statement_translation** - i18n support
- **auth_tenancy_organization_role** - Organization roles
- **auth_tenancy_organization_role_statement** - Role-statement mapping
- **auth_tenancy_team_role** - Team roles
- **auth_tenancy_team_role_statement** - Role-statement mapping

### Member Tables
- **auth_tenancy_organization_member** - Organization members
- **auth_tenancy_team_member** - Team members
- **auth_tenancy_subteam_member** - Subteam members

### Permission Override Tables
- **auth_tenancy_permission_grant** - Explicit grants
- **auth_tenancy_permission_deny** - Explicit denies

### Utility Tables
- **auth_tenancy_invitation** - Invitation system

## 💻 Client Usage

The client works everywhere: **web browsers** (Astro, Next.js, Vite), **React Native/Expo**, **Bun/Node.js servers**, and **edge runtimes** (Cloudflare Workers, Vercel Edge).

### Creating the Client

```typescript
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

const client = tenancyClient({
  baseUrl: '/api/auth', // Your Better Auth base URL
  fetch: window.fetch.bind(window), // Optional, uses global fetch by default
  locale: 'es', // Optional, for i18n support
  headers: {
    // Optional: Add custom headers
    'Authorization': `Bearer ${token}`,
  },
})
```

### Expo / React Native

```typescript
import { tenancyClient } from '@zytera/better-auth-tenancy/client'
import { getLocales } from 'expo-localization'

const client = tenancyClient({
  baseUrl: process.env.EXPO_PUBLIC_AUTH_URL,
  locale: getLocales()[0]?.languageCode || 'en', // Device language
})

// Works perfectly with React Native's fetch - no polyfills needed!
const orgs = await client.organizations.list()
```

### Available APIs

```typescript
// Organizations
client.organizations.create(...)
client.organizations.get(id)
client.organizations.update(id, ...)
client.organizations.delete(id)
client.organizations.list(options)

// Teams
client.teams.create(...)
client.teams.get(id)
client.teams.update(id, ...)
client.teams.delete(id)
client.teams.listByOrganization(orgId, options)

// Subteams
client.subteams.create(...)
client.subteams.get(id)
client.subteams.update(id, ...)
client.subteams.delete(id)
client.subteams.listByTeam(teamId, options)

// Statements
client.statements.create(...)
client.statements.get(id)
client.statements.delete(id)
client.statements.listAll()
client.statements.addTranslation(id, ...)

// Roles
client.roles.create(...)
client.roles.get(id, contextType)
client.roles.update(id, ..., contextType)
client.roles.delete(id, contextType)
client.roles.list(contextType, contextId)
client.roles.addStatements(...)
client.roles.removeStatements(...)

// Members
client.members.add(...)
client.members.updateRole(...)
client.members.remove(...)
client.members.list(contextType, contextId)

// Permissions
client.permissions.grant(...)
client.permissions.deny(...)
client.permissions.revoke(...)
client.permissions.check(...)
client.permissions.listGrants(userId)
client.permissions.listDenies(userId)

// Invitations
client.invitations.create(...)
client.invitations.accept(...)
client.invitations.reject(...)
client.invitations.cancel(...)
client.invitations.getByToken(token)
client.invitations.list(options)
```

## 📖 Examples

### Example 1: Multi-tenant SaaS Application

```typescript
// Setup for "Acme Corp" tenant
const org = await client.organizations.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
})

// Create departments as teams
const engineering = await client.teams.create({
  organizationId: org.id,
  name: 'Engineering',
  slug: 'engineering',
})

// Create sub-teams
const frontend = await client.subteams.create({
  teamId: engineering.id,
  name: 'Frontend',
  slug: 'frontend',
})

// Define permissions
await client.statements.create({
  id: 'code:commit',
  createdBy: ownerId,
})

// Create role
const seniorEngineer = await client.roles.create({
  name: 'Senior Engineer',
  contextType: 'team',
  contextId: engineering.id,
  statements: ['code:commit', 'code:review'],
  createdBy: ownerId,
})

// Add team member
await client.members.add({
  userId: developerId,
  contextType: 'team',
  contextId: engineering.id,
  roleId: seniorEngineer.id,
})
```

### Example 2: Invitation Workflow

```typescript
// Create invitation for new team member
const invitation = await client.invitations.create({
  email: 'newdev@example.com',
  contextType: 'team',
  contextId: engineeringTeamId,
  roleId: developerRoleId,
  invitedBy: managerId,
  expiresInHours: 72,
})

// Send email with invitation link
await sendEmail({
  to: 'newdev@example.com',
  subject: 'Invitation to join Engineering team',
  body: `Click here to accept: ${APP_URL}/accept-invitation/${invitation.token}`,
})

// When user accepts
await client.invitations.accept({
  invitationId: invitation.id,
  userId: newUserId,
})

// Cleanup expired invitations (run as cron job)
await client.invitations.cleanupExpired()
```

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
bun run type-check
```

## 🆘 Support

- 🐛 Issues: [GitHub Issues](https://github.com/zytera/better-auth-tenancy/issues)

## 🙏 Acknowledgments

- [Better Auth](https://github.com/better-auth/better-auth) - Authentication framework
