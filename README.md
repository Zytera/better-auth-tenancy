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
- **Explicit grants/denies**: Override role permissions at user level (deny-first policy)
- **Temporal permissions**: Set expiration dates for temporary access
- **Multi-language support**: i18n for permission names and descriptions
- **Invitation system**: Built-in email-based invitation workflow with multiple delivery methods
- **Audit hooks**: Track all permission and entity changes
- **Cache integration**: Configurable caching for high performance
- **Database-agnostic**: Works with any Better Auth database adapter
- **Universal client**: Single import works seamlessly in web and React Native/Expo (~70 lines, 85% smaller)
- **Permission filtering hooks**: Filter resources based on user permissions (organizations, teams, members)
- **Type-safe API**: Full TypeScript support with automatic endpoint inference
- **55+ REST endpoints**: Complete API out of the box

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
await client.statement.create({
  id: 'subteam:delete',
  createdBy: userId
})

// Create role with statements
await client.role.create({
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
await client.permission.grant({
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
const invitation = await client.invitation.create({
  email: 'user@example.com',
  contextType: 'team',
  contextId: teamId,
  roleId: editorRoleId,
  invitedBy: adminId,
  expiresInHours: 72
})

// Accept invitation
await client.invitation.accept({
  token: invitation.token
})
```

### 🌍 Internationalization (i18n)

Full multi-language support with automatic locale detection:

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

### 🔍 Permission Filtering Hooks

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

    // Filter teams by organization context
    filterTeams: async (userId, teams, { organizationId }) => {
      return teams.filter(team =>
        await hasPermission(userId, 'team:view', 'team', team.id)
      )
    },

    // Filter members by context
    filterOrganizationMembers: async (userId, members, { organizationId }) => {
      // Custom filtering logic
      return members
    }
  }
})
```

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

Uses Better Auth's native schema system:

```typescript
// Works with any Better Auth database adapter
export const auth = betterAuth({
  database: yourAdapter, // Prisma, Drizzle, Kysely, MongoDB, etc.
  plugins: [
    tenancy()  // Automatically creates 15 tables
  ]
})
```

Better Auth handles table creation automatically - no manual migrations needed.

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
- ✅ **Web**: Astro, Next.js, SvelteKit, Remix, Vite, vanilla JS
- ✅ **Mobile**: React Native, Expo (with @better-auth/expo)
- ✅ **Server**: Bun (recommended), Node.js, Deno
- ✅ **Edge**: Cloudflare Workers, Vercel Edge, Deno Deploy

## 🚀 Quick Start

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

Better Auth automatically creates 15 tables with the `auth_tenancy_*` prefix on first run. No manual migrations needed.

### 4. Create Your First Organization

```typescript
// Create organization
const org = await authClient.organization.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
  createdBy: userId,
})

// Create statement
await authClient.statement.create({
  id: 'team:create',
  createdBy: userId,
})

// Create organization role
const adminRole = await authClient.role.create({
  name: 'Admin',
  contextType: 'organization',
  contextId: org.id,
  statements: ['team:create', 'team:delete'],
  createdBy: userId,
})

// Add member with role
await authClient.member.add({
  userId: newUserId,
  contextType: 'organization',
  contextId: org.id,
  roleId: adminRole.id,
  addedBy: userId,
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
await authClient.statement.create({
  id: 'document:publish',
  createdBy: userId,
})

// Add translations for i18n (server-side)
await authClient.statement.addTranslation({
  statementId: 'document:publish',
  locale: 'es',
  name: 'Publicar documentos',
  description: 'Publicar documentos en producción',
  addedBy: userId,
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
await authClient.role.create({
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
await authClient.role.create({
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
await authClient.member.add({
  userId: user.id,
  contextType: 'organization',
  contextId: org.id,
  roleId: adminRoleId,
  addedBy: currentUserId,
})

// Add to team with custom role
await authClient.member.add({
  userId: user.id,
  contextType: 'team',
  contextId: team.id,
  roleId: editorRoleId,
  addedBy: currentUserId,
})
```

### Permission Checking

Check if a user has permission:

```typescript
const result = await authClient.permission.check({
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
await authClient.permission.grant({
  userId: user.id,
  statementId: 'deploy:production',
  contextType: 'team',
  contextId: team.id,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  grantedBy: adminId,
})

// Deny permission (highest priority)
await authClient.permission.deny({
  userId: user.id,
  statementId: 'sensitive:data',
  contextType: 'organization',
  contextId: org.id,
  deniedBy: securityOfficerId,
})
```

## 🔌 API Reference

### Client Methods

All endpoints are automatically inferred from the server plugin and available through the client:

```typescript
// Organizations
authClient.organization.create({ name, slug, createdBy })
authClient.organization.get({ id })
authClient.organization.update({ id, name, updatedBy })
authClient.organization.delete({ id, deletedBy })
authClient.organization.list()

// Teams
authClient.team.create({ organizationId, name, slug, createdBy })
authClient.team.get({ id })
authClient.team.update({ id, name, updatedBy })
authClient.team.delete({ id, deletedBy })
authClient.team.listByOrganization({ organizationId })

// Subteams
authClient.subteam.create({ teamId, name, slug, createdBy })
authClient.subteam.get({ id })
authClient.subteam.update({ id, name, updatedBy })
authClient.subteam.delete({ id, deletedBy })
authClient.subteam.listByTeam({ teamId })

// Statements
authClient.statement.create({ id, createdBy })
authClient.statement.get({ id })
authClient.statement.delete({ id, deletedBy })
authClient.statement.listAll()
authClient.statement.addTranslation({ statementId, locale, name, description, addedBy })

// Roles
authClient.role.create({ name, contextType, contextId, statements, createdBy })
authClient.role.get({ id })
authClient.role.update({ id, name, updatedBy })
authClient.role.delete({ id, deletedBy })
authClient.role.list({ contextType, contextId })
authClient.role.addStatement({ id, statementId, addedBy })
authClient.role.removeStatement({ id, statementId, removedBy })

// Members
authClient.member.add({ userId, contextType, contextId, roleId, addedBy })
authClient.member.updateRole({ id, roleId, updatedBy })
authClient.member.remove({ id, removedBy })
authClient.member.list({ contextType, contextId })
authClient.member.getUserMemberships({ userId })
authClient.member.checkMembership({ userId, contextType, contextId })

// Permissions
authClient.permission.grant({ userId, statementId, contextType, contextId, grantedBy, expiresAt? })
authClient.permission.deny({ userId, statementId, contextType, contextId, deniedBy })
authClient.permission.revoke({ userId, statementId, contextType, contextId, revokedBy })
authClient.permission.check({ userId, statementId, contextType, contextId })
authClient.permission.listGrants({ userId })
authClient.permission.listDenies({ userId })

// Invitations
authClient.invitation.create({ email, contextType, contextId, roleId, invitedBy, expiresInHours? })
authClient.invitation.accept({ token })
authClient.invitation.reject({ token })
authClient.invitation.cancel({ id, cancelledBy })
authClient.invitation.getByToken({ token })
authClient.invitation.getByCode({ code })
authClient.invitation.list({ contextType, contextId })
authClient.invitation.cleanupExpired()
```

## 🗄️ Database Schema

Better Auth Tenancy uses 15 tables:

### Core Tables
- `organization` - Root entities
- `team` - First-level grouping
- `subteam` - Second-level grouping

### Permission Tables
- `statement` - Permission catalog
- `statementTranslation` - i18n support
- `organizationRole` - Organization roles
- `organizationRoleStatement` - Role-statement mapping
- `teamRole` - Team roles
- `teamRoleStatement` - Role-statement mapping

### Member Tables
- `organizationMember` - Organization members
- `teamMember` - Team members
- `subteamMember` - Subteam members

### Permission Override Tables
- `permissionGrant` - Explicit grants
- `permissionDeny` - Explicit denies

### Utility Tables
- `invitation` - Invitation system

Better Auth automatically creates these tables on first run.

## 💻 Client Usage

### Universal Client

The plugin provides a **universal client** that works seamlessly in both web and React Native/Expo environments:

```typescript
import { tenancyClient } from '@zytera/better-auth-tenancy/client'
```

#### 🌐 Web/Browser

```typescript
import { createAuthClient } from 'better-auth/clients'
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

const authClient = createAuthClient({
  baseURL: '/api/auth',
  plugins: [
    tenancyClient({
      locale: 'es',
      fetchOptions: {
        credentials: 'include' // Send cookies automatically
      }
    })
  ]
})
```

**Features:**
- ✅ Automatic cookie handling with `credentials: 'include'`
- ✅ Accept-Language header support
- ✅ Works in all modern browsers

#### 📱 React Native/Expo

```typescript
import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/clients'
import { tenancyClient } from '@zytera/better-auth-tenancy/client'

const authClient = createAuthClient({
  baseURL: 'https://api.example.com/api/auth',
  plugins: [
    expoClient(),               // Required for session management
    tenancyClient({ locale: 'es' })
  ]
})
```

**Features:**
- ✅ Works with @better-auth/expo
- ✅ SecureStore integration via expoClient
- ✅ Accept-Language header support

### Configuration Options

```typescript
interface TenancyClientConfig {
  /**
   * Preferred locale for i18n (e.g., 'en', 'es', 'fr')
   * This will add the Accept-Language header to all requests
   */
  locale?: string
}
```

## 📖 Examples

### Example 1: Multi-tenant SaaS Application

```typescript
// Setup for "Acme Corp" tenant
const org = await authClient.organization.create({
  name: 'Acme Corp',
  slug: 'acme-corp',
  createdBy: userId,
})

// Create departments as teams
const engineering = await authClient.team.create({
  organizationId: org.id,
  name: 'Engineering',
  slug: 'engineering',
  createdBy: userId,
})

// Create sub-teams
const frontend = await authClient.subteam.create({
  teamId: engineering.id,
  name: 'Frontend',
  slug: 'frontend',
  createdBy: userId,
})

// Define permissions
await authClient.statement.create({
  id: 'code:commit',
  createdBy: userId,
})

// Create role
const seniorEngineer = await authClient.role.create({
  name: 'Senior Engineer',
  contextType: 'team',
  contextId: engineering.id,
  statements: ['code:commit', 'code:review'],
  createdBy: userId,
})

// Add team member
await authClient.member.add({
  userId: developerId,
  contextType: 'team',
  contextId: engineering.id,
  roleId: seniorEngineer.id,
  addedBy: userId,
})
```

### Example 2: Invitation Workflow

```typescript
// Create invitation for new team member
const invitation = await authClient.invitation.create({
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
await authClient.invitation.accept({
  token: invitation.token
})

// Cleanup expired invitations (run as cron job)
await authClient.invitation.cleanupExpired()
```

### Example 3: React Native/Expo App

```typescript
import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/clients'
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
      const result = await authClient.organization.list()
      setOrgs(result)
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

## 🔒 Security Best Practices

1. **Always use HTTPS in production**
2. **Validate user input** on the server side
3. **Use deny rules** for sensitive permissions
4. **Set expiration dates** for temporary permissions
5. **Audit permission changes** using audit hooks
6. **Implement rate limiting** on invitation endpoints
7. **Use environment variables** for sensitive configuration

## 📝 Development

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

## 🆘 Support

- 🐛 Issues: [GitHub Issues](https://github.com/zytera/better-auth-tenancy/issues)
- 📖 Documentation: [Full Docs](https://github.com/zytera/better-auth-tenancy/docs)

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [Better Auth](https://github.com/better-auth/better-auth) - Authentication framework
- [Expo](https://expo.dev) - Mobile framework
- [Bun](https://bun.sh) - JavaScript runtime

---

**Version**: 1.0.0
**Author**: Zytera
**Keywords**: better-auth, auth, authorization, permissions, rbac, access-control, organizations, teams, multi-tenant, tenancy, workspace, saas
