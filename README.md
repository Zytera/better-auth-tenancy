# @zytera/better-auth-permissions

Multi-level permissions plugin for Better Auth with organization, team, and medical unit scopes.

## Features

- ✅ **3-Level Permission System**: Organization → Team → Medical Unit
- ✅ **Granular Scopes**: Fine-grained permissions like `unit.members.read`, `service.admin`
- ✅ **Scope Groups**: Group scopes together (similar to GCloud roles)
- ✅ **Multi-language Support**: Translate scope names and descriptions
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Better Auth Integration**: Seamless integration with Better Auth

## Installation

```bash
bun add @zytera/better-auth-permissions
# or
npm install @zytera/better-auth-permissions
```

## Setup

### Server Setup

```typescript
// src/auth.ts
import { betterAuth } from "better-auth";
import { permissionsPlugin } from "@zytera/better-auth-permissions";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  plugins: [
    permissionsPlugin(),
    // ... other plugins
  ],
});
```

### Client Setup

```typescript
// src/auth-client.ts
import { createAuthClient } from "better-auth/client";
import { permissionsClient } from "@zytera/better-auth-permissions/client";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [permissionsClient()],
});
```

## Usage

All permission methods are available directly on the `authClient` object:

### Create Scopes and Groups

```typescript
// Create individual scopes
await authClient.createScope({ name: "unit.members.read" });
await authClient.createScope({ name: "unit.members.write" });
await authClient.createScope({ name: "unit.admin.grant" });

// Create scope group
await authClient.createScopeGroup({
  name: "unit.admin",
  scopes: [
    "unit.members.read",
    "unit.members.write",
    "unit.admin.grant",
  ],
});
```

### Assign Permissions

```typescript
// Assign at organization level
await authClient.assignOrganizationScopeGroup({
  userId: "user-123",
  organizationId: "org-hospital",
  scopeGroupName: "hospital.admin",
});

// Assign at team level
await authClient.assignTeamScopeGroup({
  userId: "user-123",
  teamId: "team-cardiology",
  scopeGroupName: "service.admin",
});

// Assign at medical unit level
await authClient.assignMedicalUnitScopeGroup({
  userId: "user-123",
  medicalUnitId: "unit-uci",
  scopeGroupName: "unit.admin",
});
```

### Check Permissions

```typescript
// Check if user has permission
const { hasPermission } = await authClient.checkPermission({
  userId: "user-123",
  scopeName: "unit.members.write",
  context: {
    type: "medicalUnit",
    medicalUnitId: "unit-uci",
  },
});

if (hasPermission) {
  // User can write to unit members
}
```

### Medical Units

```typescript
// Create medical unit
const unit = await authClient.createMedicalUnit({
  name: "UCI Cardiológica",
  teamId: "team-cardiology",
  metadata: JSON.stringify({ capacity: 20, floor: 3 }),
});

// List units in a team
const units = await authClient.listMedicalUnitsByTeam("team-cardiology");
```

## Internationalization

The plugin automatically detects the user's language from the `Accept-Language` HTTP header for listing scopes and scope groups with translations. The client will automatically send this header based on the browser's language settings.

```typescript
// Language is automatically detected from Accept-Language header
const scopes = await authClient.listScopes();
```

## React Native / Expo Support

This plugin is fully compatible with React Native and Expo apps. The client code uses only standard JavaScript APIs with no web-specific dependencies.

### Setup in Expo

```typescript
// app/lib/auth.ts
import { createAuthClient } from "better-auth/client";
import { permissionsClient } from "@zytera/better-auth-permissions/client";
import * as Localization from 'expo-localization';

export const authClient = createAuthClient({
  baseURL: "https://your-api.com",
  plugins: [permissionsClient()],
  fetchOptions: {
    headers: {
      // Set Accept-Language header for internationalization
      'Accept-Language': Localization.locale, // e.g., "en-US" or "es-ES"
    },
  },
});
```

### Usage in React Native Components

```typescript
import { authClient } from './lib/auth';

export function PermissionsScreen() {
  const [scopes, setScopes] = useState([]);

  useEffect(() => {
    async function loadScopes() {
      const data = await authClient.listScopes();
      setScopes(data);
    }
    loadScopes();
  }, []);

  // ... rest of component
}
```

## Database Schema

The plugin automatically creates the following tables via Better Auth's migration system:

### Core Tables

#### `medical_unit`
Third level of the hierarchy (Organization → Team → Medical Unit)
- `id` (text, primary key)
- `name` (text, not null)
- `team_id` (text, not null) - References Better Auth's `team` table
- `metadata` (text, nullable) - JSON for additional data
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### `medical_unit_member`
User membership in medical units
- `id` (text, primary key)
- `medical_unit_id` (text, not null)
- `user_id` (text, not null) - References Better Auth's `user` table
- `created_at` (timestamp)

### Permission Tables

#### `scope`
Individual permissions (e.g., "unit.members.read")
- `id` (text, primary key)
- `name` (text, unique, not null)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### `scope_group`
Groups of scopes (e.g., "unit.admin")
- `id` (text, primary key)
- `name` (text, unique, not null)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### `scope_group_scope`
Many-to-many relationship between scope groups and scopes
- `scope_group_id` (text, foreign key)
- `scope_id` (text, foreign key)
- `created_at` (timestamp)
- **Primary key**: (`scope_group_id`, `scope_id`)

### User Permission Assignment Tables

#### Organization Level (Hospital)
- `user_organization_scope` - Direct scope assignments
  - **Primary key**: (`user_id`, `organization_id`, `scope_id`)
- `user_organization_scope_group` - Scope group assignments
  - **Primary key**: (`user_id`, `organization_id`, `scope_group_id`)

#### Team Level (Service)
- `user_team_scope` - Direct scope assignments
  - **Primary key**: (`user_id`, `team_id`, `scope_id`)
- `user_team_scope_group` - Scope group assignments
  - **Primary key**: (`user_id`, `team_id`, `scope_group_id`)

#### Medical Unit Level
- `user_medical_unit_scope` - Direct scope assignments
  - **Primary key**: (`user_id`, `medical_unit_id`, `scope_id`)
- `user_medical_unit_scope_group` - Scope group assignments
  - **Primary key**: (`user_id`, `medical_unit_id`, `scope_group_id`)

### Translation Tables

#### `scope_translation`
Translations for scope names and descriptions
- `scope_id` (text, foreign key)
- `language` (text) - e.g., "es", "en"
- `name` (text, not null)
- `description` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- **Primary key**: (`scope_id`, `language`)

#### `scope_group_translation`
Translations for scope group names and descriptions
- `scope_group_id` (text, foreign key)
- `language` (text) - e.g., "es", "en"
- `name` (text, not null)
- `description` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- **Primary key**: (`scope_group_id`, `language`)

### Running Migrations

Better Auth automatically creates these tables. See "Database Migrations" section below for migration commands.

## Architecture

### 3-Level Hierarchy

```
Organization (Hospital)
├─ Team (Service: Cardiology, Urology, etc.)
│  └─ MedicalUnit (UCI, Litotripsy, etc.)
│     └─ Users with specific scopes
```

### Permission Context

Permissions are checked within a specific context:

- **Organization Context**: Hospital-wide permissions
- **Team Context**: Service-specific permissions
- **MedicalUnit Context**: Unit-specific permissions

A user can have **different permissions at each level**.

### Example Scenario

Dr. López can be:
- `hospital.viewer` at Hospital General
- `service.admin` at Cardiology Service
  - `unit.admin` at UCI Cardiológica
  - `unit.editor` at Hemodinámica
  - No access to Electrofisiología

## Predefined Scope Groups

### Personal
- `personal.basic`

### Unit Level
- `unit.viewer` - Read-only access
- `unit.editor` - Full management without permissions
- `unit.admin` - Full control including permissions

### Service Level
- `service.viewer` - Read-only access
- `service.editor` - Full management without permissions
- `service.admin` - Full control including permissions

### Hospital Level
- `hospital.viewer` - Read-only access
- `hospital.admin` - Full control

### Special
- `residents.tutor` - Tutor permissions


## Development with `bun link`

For local development:

```bash
# In the plugin directory
cd better-auth-permissions
bun install
bun link

# In your project
cd your-project
bun link @zytera/better-auth-permissions
```
