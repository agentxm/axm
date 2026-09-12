import boundaries from "eslint-plugin-boundaries";

const sourceExtension = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

/** The same native file descriptors classify imports and capability graphs. */
export function capabilityFileRules(elements, declaredRoles = []) {
  const inCapabilities = (suffix) =>
    elements.flatMap(({ pattern }) => [pattern].flat().map((root) => `${root}/${suffix}`));
  return [
    {
      pattern: [
        ...inCapabilities(`**/*.{test,spec,shared-spec}.${sourceExtension}`),
        ...inCapabilities(`**/{test-helpers,testing}.${sourceExtension}`),
        ...inCapabilities("**/{test-support,__fixtures__}/**/*"),
      ],
      category: "test",
    },
    ...declaredRoles,
    { pattern: inCapabilities("domain/**/*"), category: "domain" },
    { pattern: inCapabilities("application/**/*"), category: "application" },
    { pattern: inCapabilities("adapters/**/*"), category: "adapter" },
    { pattern: inCapabilities("composition/**/*"), category: "composition" },
  ];
}

/**
 * Capability descriptors use the plugin's own schema. Strategic classification
 * is captured from placement; element type is frontstage or backstage. Files
 * carry the independent architectural role. There is no second module model.
 */
export function capabilityBoundaries(rootPath, elements, files, roleDescriptors = []) {
  const roots = elements
    .filter(({ type }) => type !== "test-support")
    .flatMap(({ pattern }) => pattern);
  const inCapabilities = (suffix) => roots.map((root) => `${root}/${suffix}`);
  const fileDescriptors = capabilityFileRules(elements, roleDescriptors);
  const testFiles = fileDescriptors
    .filter(({ category }) => category === "test")
    .flatMap(({ pattern }) => pattern);
  const roleFiles = (role) => inCapabilities(`${role}/**/*`);
  const declaredRoleFiles = (roles) =>
    roleDescriptors
      .filter(({ category }) => [category].flat().some((role) => roles.includes(role)))
      .flatMap(({ pattern }) => pattern);
  const publicDomain = [
    { element: { fileInternalPath: `domain/index.${sourceExtension}` } },
    { file: { categories: "domain-api" } },
  ];
  const publicApplication = [
    { element: { fileInternalPath: `application/index.${sourceExtension}` } },
    { file: { categories: "application-api" } },
  ];

  return [
    {
      name: "capabilities/dependencies",
      files,
      plugins: { boundaries },
      settings: {
        "boundaries/root-path": rootPath,
        "boundaries/elements": elements,
        "boundaries/files-single-match": true,
        "boundaries/files": fileDescriptors,
        "import/resolver": {
          typescript: {
            project: [],
            conditionNames: ["axm-source", "import", "node", "default"],
          },
        },
      },
      rules: {
        "boundaries/no-unknown-files": "error",
        "boundaries/no-unknown-dependencies": "error",
        "boundaries/no-ignored-dependencies": "error",
        "boundaries/dependencies": [
          "error",
          {
            default: "disallow",
            checkAllOrigins: true,
            checkUnknownLocals: true,
            checkInternals: true,
            message:
              "Use the owning capability's public domain/application contract; technology belongs in adapters and concrete wiring in composition.",
            policies: [
              {
                allow: {
                  to: { element: { path: "{{from.element.path}}" } },
                },
              },
              {
                from: {
                  file: { categories: ["domain", "domain-api", "application", "application-api"] },
                },
                allow: {
                  to: {
                    module: {
                      origin: "external",
                      source: ["effect", "semver", "packageurl-js", "spdx-expression-parse"],
                    },
                  },
                },
              },
              {
                from: { file: { categories: ["adapter", "composition", "test"] } },
                allow: { to: { module: { origin: ["external", "core"] } } },
              },
              {
                from: { file: { categories: "test" } },
                allow: { to: { element: { type: "test-support" } } },
              },
              {
                to: { element: { type: "backstage" } },
                allow: { to: publicDomain },
              },
              {
                from: {
                  file: {
                    categories: [
                      "application",
                      "application-api",
                      "adapter",
                      "composition",
                      "test",
                    ],
                  },
                },
                to: { element: { type: "backstage" } },
                allow: { to: publicApplication },
              },
              {
                from: { file: { categories: "adapter" } },
                allow: { to: [...publicDomain, ...publicApplication] },
              },
              {
                from: { file: { categories: "composition" } },
                allow: {
                  to: [
                    ...publicDomain,
                    ...publicApplication,
                    { element: { fileInternalPath: `adapters/*/index.${sourceExtension}` } },
                    { element: { fileInternalPath: `composition/index.${sourceExtension}` } },
                  ],
                },
              },
              // Invariant denials come last: this plugin uses last-match precedence.
              {
                from: {
                  file: { categories: ["domain", "domain-api", "application", "application-api"] },
                },
                disallow: {
                  to: { module: { source: "effect", internalPath: ["FileSystem", "unstable/**"] } },
                },
                message:
                  "Filesystem and provider access belong in adapters implementing capability-owned ports.",
              },
              {
                from: { element: { captured: { strategy: "generic" } } },
                disallow: { to: { element: { captured: { strategy: "!generic" } } } },
                message:
                  "Generic capabilities must remain independent of product-specific capabilities.",
              },
              {
                from: {
                  element: { type: "backstage" },
                  file: { categories: ["domain", "domain-api", "application", "application-api"] },
                },
                disallow: { to: { element: { type: "frontstage" } } },
                message:
                  "Backstage capabilities must not depend on frontstage consumers, including their types.",
              },
              {
                from: { file: { categories: ["domain", "domain-api"] } },
                disallow: {
                  to: {
                    file: {
                      categories: [
                        "application",
                        "application-api",
                        "adapter",
                        "composition",
                        "test",
                      ],
                    },
                  },
                },
                message:
                  "Domain policy depends on domain contracts; orchestration, adapters, and composition point inward.",
              },
              {
                from: { file: { categories: ["application", "application-api"] } },
                disallow: { to: { file: { categories: ["adapter", "composition", "test"] } } },
                message:
                  "Application code owns ports and workflows; select concrete adapters at composition.",
              },
              {
                from: { file: { categories: ["adapter", "composition"] } },
                disallow: { to: { file: { categories: "test" } } },
                message: "Production code must not depend on test implementations or fixtures.",
              },
            ],
          },
        ],
      },
    },
    {
      name: "capabilities/placement",
      files: inCapabilities(`**/*.${sourceExtension}`),
      ignores: [
        ...testFiles,
        ...roleFiles("domain"),
        ...roleFiles("application"),
        ...roleFiles("adapters"),
        ...roleFiles("composition"),
        ...roleDescriptors.flatMap(({ pattern }) => pattern),
      ],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: "Program",
            message:
              "Place capability code in domain, application, adapters, or composition according to its responsibility.",
          },
        ],
      },
    },
    {
      name: "capabilities/policy-mechanisms",
      files: [
        ...roleFiles("domain"),
        ...roleFiles("application"),
        ...declaredRoleFiles(["domain", "domain-api", "application", "application-api"]),
      ],
      ignores: testFiles,
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "effect",
                importNames: ["FileSystem"],
                message:
                  "Express required facts and operations through capability-owned ports; implement filesystem access in an adapter.",
              },
            ],
          },
        ],
        "no-restricted-globals": [
          "error",
          {
            name: "fetch",
            message: "HTTP access belongs in an adapter implementing an owned port.",
          },
          {
            name: "process",
            message:
              "Provide configuration at composition; policy must not read ambient process state.",
          },
        ],
      },
    },
  ];
}
