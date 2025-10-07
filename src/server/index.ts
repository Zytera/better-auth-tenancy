import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { generateId } from "better-auth";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
    scope,
    scopeGroup,
    scopeGroupScope,
    medicalUnit,
    medicalUnitMember,
    userOrganizationScope,
    userOrganizationScopeGroup,
    userTeamScope,
    userTeamScopeGroup,
    userMedicalUnitScope,
    userMedicalUnitScopeGroup,
    scopeTranslation,
    scopeGroupTranslation,
} from "./schema";

export * from "./schema";

// ============================================================================
// PERMISSIONS PLUGIN FOR BETTER AUTH
// ============================================================================

export function permissionsPlugin(): BetterAuthPlugin {
    return {
        id: "permissions",
        schema: {
            scope: {
                fields: {
                    id: { type: "string", required: true },
                    name: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                    updatedAt: { type: "date", required: true },
                },
            },
            scopeGroup: {
                fields: {
                    id: { type: "string", required: true },
                    name: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                    updatedAt: { type: "date", required: true },
                },
            },
            medicalUnit: {
                fields: {
                    id: { type: "string", required: true },
                    name: { type: "string", required: true },
                    teamId: { type: "string", required: true },
                    metadata: { type: "string", required: false },
                    createdAt: { type: "date", required: true },
                    updatedAt: { type: "date", required: true },
                },
            },
            medicalUnitMember: {
                fields: {
                    id: { type: "string", required: true },
                    medicalUnitId: { type: "string", required: true },
                    userId: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                },
            },
            scopeGroupScope: {
                fields: {
                    scopeGroupId: { type: "string", required: true },
                    scopeId: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                },
            },
            userOrganizationScope: {
                fields: {
                    userId: { type: "string", required: true },
                    organizationId: { type: "string", required: true },
                    scopeId: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                },
            },
            userOrganizationScopeGroup: {
                fields: {
                    userId: { type: "string", required: true },
                    organizationId: { type: "string", required: true },
                    scopeGroupId: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                },
            },
            userTeamScope: {
                fields: {
                    userId: { type: "string", required: true },
                    teamId: { type: "string", required: true },
                    scopeId: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                },
            },
            userTeamScopeGroup: {
                fields: {
                    userId: { type: "string", required: true },
                    teamId: { type: "string", required: true },
                    scopeGroupId: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                },
            },
            userMedicalUnitScope: {
                fields: {
                    userId: { type: "string", required: true },
                    medicalUnitId: { type: "string", required: true },
                    scopeId: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                },
            },
            userMedicalUnitScopeGroup: {
                fields: {
                    userId: { type: "string", required: true },
                    medicalUnitId: { type: "string", required: true },
                    scopeGroupId: { type: "string", required: true },
                    createdAt: { type: "date", required: true },
                },
            },
            scopeTranslation: {
                fields: {
                    scopeId: { type: "string", required: true },
                    language: { type: "string", required: true },
                    name: { type: "string", required: true },
                    description: { type: "string", required: false },
                    createdAt: { type: "date", required: true },
                    updatedAt: { type: "date", required: true },
                },
            },
            scopeGroupTranslation: {
                fields: {
                    scopeGroupId: { type: "string", required: true },
                    language: { type: "string", required: true },
                    name: { type: "string", required: true },
                    description: { type: "string", required: false },
                    createdAt: { type: "date", required: true },
                    updatedAt: { type: "date", required: true },
                },
            },
        },
        endpoints: {
            // Medical Unit Management
            createMedicalUnit: createAuthEndpoint(
                "/permissions/medical-unit/create",
                {
                    method: "POST",
                    body: z.object({
                        name: z.string(),
                        teamId: z.string(),
                        metadata: z.string().optional(),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { name, teamId, metadata } = ctx.body;

                    const unit = await db.insert(medicalUnit).values({
                        id: generateId(),
                        name,
                        teamId,
                        metadata,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }).returning();

                    return ctx.json(unit[0]);
                }
            ),

            listMedicalUnitsByTeam: createAuthEndpoint(
                "/permissions/medical-unit/list",
                {
                    method: "GET",
                    query: z.object({ teamId: z.string() }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const units = await db
                        .select()
                        .from(medicalUnit)
                        .where(eq(medicalUnit.teamId, ctx.query.teamId));

                    return ctx.json(units);
                }
            ),

            // Scope Management
            createScope: createAuthEndpoint(
                "/permissions/scope/create",
                {
                    method: "POST",
                    body: z.object({
                        name: z.string(),
                        translations: z.array(z.object({
                            language: z.string(),
                            name: z.string(),
                            description: z.string().optional(),
                        })).optional(),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { name, translations } = ctx.body;

                    const newScope = await db.insert(scope).values({
                        id: generateId(),
                        name,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }).returning();

                    // Add translations if provided
                    if (translations && translations.length > 0) {
                        for (const translation of translations) {
                            await db.insert(scopeTranslation).values({
                                scopeId: newScope[0].id,
                                language: translation.language,
                                name: translation.name,
                                description: translation.description || null,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            });
                        }
                    }

                    return ctx.json(newScope[0]);
                }
            ),

            addScopeTranslation: createAuthEndpoint(
                "/permissions/scope/translation/add",
                {
                    method: "POST",
                    body: z.object({
                        scopeId: z.string(),
                        language: z.string(),
                        name: z.string(),
                        description: z.string().optional(),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { scopeId, language, name, description } = ctx.body;

                    const translation = await db.insert(scopeTranslation).values({
                        scopeId,
                        language,
                        name,
                        description: description || null,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }).returning();

                    return ctx.json(translation[0]);
                }
            ),

            listScopes: createAuthEndpoint(
                "/permissions/scope/list",
                {
                    method: "GET",
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;

                    // Get language from Accept-Language header, default to 'en'
                    const acceptLanguage = ctx.headers?.get("accept-language") || "en";
                    const language = acceptLanguage.split(",")[0].split("-")[0]; // Extract primary language code

                    const scopes = await db.select().from(scope);
                    return ctx.json(scopes);
                }
            ),

            // Scope Group Management
            createScopeGroup: createAuthEndpoint(
                "/permissions/scope-group/create",
                {
                    method: "POST",
                    body: z.object({
                        name: z.string(),
                        scopes: z.array(z.string()),
                        translations: z.array(z.object({
                            language: z.string(),
                            name: z.string(),
                            description: z.string().optional(),
                        })).optional(),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { name, scopes: scopeNames, translations } = ctx.body;

                    const newGroup = await db.insert(scopeGroup).values({
                        id: generateId(),
                        name,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }).returning();

                    for (const scopeName of scopeNames) {
                        const scopeRecord = await db
                            .select()
                            .from(scope)
                            .where(eq(scope.name, scopeName))
                            .limit(1);

                        if (scopeRecord.length > 0) {
                            await db.insert(scopeGroupScope).values({
                                scopeGroupId: newGroup[0].id,
                                scopeId: scopeRecord[0].id,
                                createdAt: new Date(),
                            });
                        }
                    }

                    // Add translations if provided
                    if (translations && translations.length > 0) {
                        for (const translation of translations) {
                            await db.insert(scopeGroupTranslation).values({
                                scopeGroupId: newGroup[0].id,
                                language: translation.language,
                                name: translation.name,
                                description: translation.description || null,
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            });
                        }
                    }

                    return ctx.json(newGroup[0]);
                }
            ),

            addScopeGroupTranslation: createAuthEndpoint(
                "/permissions/scope-group/translation/add",
                {
                    method: "POST",
                    body: z.object({
                        scopeGroupId: z.string(),
                        language: z.string(),
                        name: z.string(),
                        description: z.string().optional(),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { scopeGroupId, language, name, description } = ctx.body;

                    const translation = await db.insert(scopeGroupTranslation).values({
                        scopeGroupId,
                        language,
                        name,
                        description: description || null,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    }).returning();

                    return ctx.json(translation[0]);
                }
            ),

            // Assign Permissions
            assignOrganizationScopeGroup: createAuthEndpoint(
                "/permissions/assign/organization/scope-group",
                {
                    method: "POST",
                    body: z.object({
                        userId: z.string(),
                        organizationId: z.string(),
                        scopeGroupName: z.string(),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { userId, organizationId, scopeGroupName } = ctx.body;

                    const groupRecord = await db
                        .select()
                        .from(scopeGroup)
                        .where(eq(scopeGroup.name, scopeGroupName))
                        .limit(1);

                    if (groupRecord.length === 0) {
                        return ctx.json({ error: "Scope group not found" }, { status: 404 });
                    }

                    await db.insert(userOrganizationScopeGroup).values({
                        userId,
                        organizationId,
                        scopeGroupId: groupRecord[0].id,
                        createdAt: new Date(),
                    });

                    return ctx.json({ success: true });
                }
            ),

            assignTeamScopeGroup: createAuthEndpoint(
                "/permissions/assign/team/scope-group",
                {
                    method: "POST",
                    body: z.object({
                        userId: z.string(),
                        teamId: z.string(),
                        scopeGroupName: z.string(),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { userId, teamId, scopeGroupName } = ctx.body;

                    const groupRecord = await db
                        .select()
                        .from(scopeGroup)
                        .where(eq(scopeGroup.name, scopeGroupName))
                        .limit(1);

                    if (groupRecord.length === 0) {
                        return ctx.json({ error: "Scope group not found" }, { status: 404 });
                    }

                    await db.insert(userTeamScopeGroup).values({
                        userId,
                        teamId,
                        scopeGroupId: groupRecord[0].id,
                        createdAt: new Date(),
                    });

                    return ctx.json({ success: true });
                }
            ),

            assignMedicalUnitScopeGroup: createAuthEndpoint(
                "/permissions/assign/medical-unit/scope-group",
                {
                    method: "POST",
                    body: z.object({
                        userId: z.string(),
                        medicalUnitId: z.string(),
                        scopeGroupName: z.string(),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { userId, medicalUnitId, scopeGroupName } = ctx.body;

                    const groupRecord = await db
                        .select()
                        .from(scopeGroup)
                        .where(eq(scopeGroup.name, scopeGroupName))
                        .limit(1);

                    if (groupRecord.length === 0) {
                        return ctx.json({ error: "Scope group not found" }, { status: 404 });
                    }

                    await db.insert(userMedicalUnitScopeGroup).values({
                        userId,
                        medicalUnitId,
                        scopeGroupId: groupRecord[0].id,
                        createdAt: new Date(),
                    });

                    return ctx.json({ success: true });
                }
            ),

            // Check Permissions
            checkPermission: createAuthEndpoint(
                "/permissions/check",
                {
                    method: "POST",
                    body: z.object({
                        userId: z.string(),
                        scopeName: z.string(),
                        context: z.union([
                            z.object({ type: z.literal("organization"), organizationId: z.string() }),
                            z.object({ type: z.literal("team"), teamId: z.string() }),
                            z.object({ type: z.literal("medicalUnit"), medicalUnitId: z.string() }),
                        ]),
                    }),
                },
                async (ctx) => {
                    // @ts-ignore - Better Auth adapter.db is not typed but exists at runtime
                    const db = ctx.context.adapter.db;
                    const { userId, scopeName, context } = ctx.body;

                    // Get scope
                    const scopeRecord = await db
                        .select()
                        .from(scope)
                        .where(eq(scope.name, scopeName))
                        .limit(1);

                    if (scopeRecord.length === 0) {
                        return ctx.json({ hasPermission: false });
                    }

                    // Check based on context type
                    let hasPermission = false;

                    if (context.type === "organization") {
                        const result = await db
                            .select()
                            .from(userOrganizationScope)
                            .where(eq(userOrganizationScope.userId, userId))
                            .limit(1);
                        hasPermission = result.length > 0;
                    } else if (context.type === "team") {
                        const result = await db
                            .select()
                            .from(userTeamScope)
                            .where(eq(userTeamScope.userId, userId))
                            .limit(1);
                        hasPermission = result.length > 0;
                    } else if (context.type === "medicalUnit") {
                        const result = await db
                            .select()
                            .from(userMedicalUnitScope)
                            .where(eq(userMedicalUnitScope.userId, userId))
                            .limit(1);
                        hasPermission = result.length > 0;
                    }

                    return ctx.json({ hasPermission });
                }
            ),
        },
    };
}