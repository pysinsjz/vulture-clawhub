export const LegacyApiRoutes = {
    download: "/api/download",
    search: "/api/search",
    skill: "/api/skill",
    skillResolve: "/api/skill/resolve",
    cliWhoami: "/api/cli/whoami",
    cliUploadUrl: "/api/cli/upload-url",
    cliPublish: "/api/cli/publish",
    cliTelemetryInstall: "/api/cli/telemetry/install",
    cliTelemetrySync: "/api/cli/telemetry/sync",
    cliSkillDelete: "/api/cli/skill/delete",
    cliSkillUndelete: "/api/cli/skill/undelete",
};
export const ApiRoutes = {
    search: "/api/v1/search",
    resolve: "/api/v1/resolve",
    download: "/api/v1/download",
    publishTokenMint: "/api/v1/publish/token/mint",
    skills: "/api/v1/skills",
    skillScans: "/api/v1/skills/-/scan",
    plugins: "/api/v1/plugins",
    pluginsExport: "/api/v1/plugins/export",
    packages: "/api/v1/packages",
    codePlugins: "/api/v1/code-plugins",
    bundlePlugins: "/api/v1/bundle-plugins",
    stars: "/api/v1/stars",
    transfers: "/api/v1/transfers",
    publishers: "/api/v1/publishers",
    souls: "/api/v1/souls",
    users: "/api/v1/users",
    whoami: "/api/v1/whoami",
    skillsExport: "/api/v1/skills/export",
    // Marketplace category dictionaries — Gateway pulls these as the
    // authoritative source for the operator-curated list, then aggregates
    // counts itself (see contracts/marketplace.md + PRD §"Gateway 端"). Public
    // (active) rows only; archived categories are served via the management
    // queries, not over REST.
    pluginCategories: "/api/v1/plugins/categories",
    skillCategories: "/api/v1/skills/categories",
};
//# sourceMappingURL=routes.js.map