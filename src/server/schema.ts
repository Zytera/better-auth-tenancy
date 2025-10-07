import {
    pgTable,
    text,
    timestamp,
    primaryKey,
} from "drizzle-orm/pg-core";

// ============================================================================
// MEDICAL UNIT - Nivel 3 de la jerarquía (Organization -> Team -> MedicalUnit)
// ============================================================================

export const medicalUnit = pgTable("medical_unit", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    teamId: text("team_id").notNull(), // References team(id) - handled by Better Auth
    metadata: text("metadata"), // JSON for additional data
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull(),
});

export const medicalUnitMember = pgTable("medical_unit_member", {
    id: text("id").primaryKey(),
    medicalUnitId: text("medical_unit_id").notNull(), // References medical_unit(id)
    userId: text("user_id").notNull(), // References user(id) - handled by Better Auth
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
});

// ============================================================================
// SCOPES - Permisos granulares (e.g., "unit.members.read")
// ============================================================================

export const scope = pgTable("scope", {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(), // e.g., "unit.members.read"
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull(),
});

// ============================================================================
// SCOPE GROUPS - Grupos de scopes (e.g., "unit.admin")
// ============================================================================

export const scopeGroup = pgTable("scope_group", {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(), // e.g., "unit.admin"
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull(),
});

// Many-to-many: Scope Groups contain multiple Scopes
export const scopeGroupScope = pgTable("scope_group_scope", {
    scopeGroupId: text("scope_group_id")
        .notNull()
        .references(() => scopeGroup.id, { onDelete: "cascade" }),
    scopeId: text("scope_id")
        .notNull()
        .references(() => scope.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.scopeGroupId, table.scopeId] }),
}));

// ============================================================================
// NIVEL 1: ORGANIZATION SCOPES (Hospital)
// ============================================================================

// Individual scopes at organization level
export const userOrganizationScope = pgTable("user_organization_scope", {
    userId: text("user_id").notNull(), // References user(id) - handled by Better Auth
    organizationId: text("organization_id").notNull(), // References organization(id) - handled by Better Auth
    scopeId: text("scope_id")
        .notNull()
        .references(() => scope.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.organizationId, table.scopeId] }),
}));

// Scope groups at organization level
export const userOrganizationScopeGroup = pgTable("user_organization_scope_group", {
    userId: text("user_id").notNull(), // References user(id) - handled by Better Auth
    organizationId: text("organization_id").notNull(), // References organization(id) - handled by Better Auth
    scopeGroupId: text("scope_group_id")
        .notNull()
        .references(() => scopeGroup.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.organizationId, table.scopeGroupId] }),
}));

// ============================================================================
// NIVEL 2: TEAM SCOPES (Servicio)
// ============================================================================

// Individual scopes at team level
export const userTeamScope = pgTable("user_team_scope", {
    userId: text("user_id").notNull(), // References user(id) - handled by Better Auth
    teamId: text("team_id").notNull(), // References team(id) - handled by Better Auth
    scopeId: text("scope_id")
        .notNull()
        .references(() => scope.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.teamId, table.scopeId] }),
}));

// Scope groups at team level
export const userTeamScopeGroup = pgTable("user_team_scope_group", {
    userId: text("user_id").notNull(), // References user(id) - handled by Better Auth
    teamId: text("team_id").notNull(), // References team(id) - handled by Better Auth
    scopeGroupId: text("scope_group_id")
        .notNull()
        .references(() => scopeGroup.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.teamId, table.scopeGroupId] }),
}));

// ============================================================================
// NIVEL 3: MEDICAL UNIT SCOPES (Unidad Médica)
// ============================================================================

// Individual scopes at medical unit level
export const userMedicalUnitScope = pgTable("user_medical_unit_scope", {
    userId: text("user_id").notNull(), // References user(id) - handled by Better Auth
    medicalUnitId: text("medical_unit_id")
        .notNull()
        .references(() => medicalUnit.id, { onDelete: "cascade" }),
    scopeId: text("scope_id")
        .notNull()
        .references(() => scope.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.medicalUnitId, table.scopeId] }),
}));

// Scope groups at medical unit level
export const userMedicalUnitScopeGroup = pgTable("user_medical_unit_scope_group", {
    userId: text("user_id").notNull(), // References user(id) - handled by Better Auth
    medicalUnitId: text("medical_unit_id")
        .notNull()
        .references(() => medicalUnit.id, { onDelete: "cascade" }),
    scopeGroupId: text("scope_group_id")
        .notNull()
        .references(() => scopeGroup.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.medicalUnitId, table.scopeGroupId] }),
}));

// ============================================================================
// TRANSLATIONS - Soporte multiidioma
// ============================================================================

// Translations for scopes
export const scopeTranslation = pgTable("scope_translation", {
    scopeId: text("scope_id")
        .notNull()
        .references(() => scope.id, { onDelete: "cascade" }),
    language: text("language").notNull(), // e.g., "es", "en"
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.scopeId, table.language] }),
}));

// Translations for scope groups
export const scopeGroupTranslation = pgTable("scope_group_translation", {
    scopeGroupId: text("scope_group_id")
        .notNull()
        .references(() => scopeGroup.id, { onDelete: "cascade" }),
    language: text("language").notNull(), // e.g., "es", "en"
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at")
        .$defaultFn(() => new Date())
        .notNull(),
    updatedAt: timestamp("updated_at")
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.scopeGroupId, table.language] }),
}));