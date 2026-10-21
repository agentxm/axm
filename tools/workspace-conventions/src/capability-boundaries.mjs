// The plugin's declarations describe an ES module default export over a
// CommonJS module, so Node's ESM interop types disagree with the runtime value;
// this package's typecheck therefore resolves modules as a bundler does.
import boundaries from "eslint-plugin-boundaries";

const sourceExtension = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

/**
 * An `eslint-plugin-boundaries` element descriptor. Capability elements have
 * the type `frontstage` or `backstage` and capture `strategy` from their path;
 * `test-support` elements hold shared test implementations.
 *
 * @typedef {{ readonly type: string, readonly pattern: string | readonly string[] } & Readonly<Record<string, unknown>>} ElementDescriptor
 */

/**
 * An `eslint-plugin-boundaries` file descriptor that assigns a category.
 *
 * @typedef {{ readonly pattern: string | readonly string[], readonly category: string | readonly string[] }} FileDescriptor
 */

/**
 * An `eslint-plugin-boundaries` dependency policy or selector, in the
 * plugin's own schema.
 *
 * @typedef {Readonly<Record<string, unknown>>} BoundariesObject
 */

/**
 * A `no-restricted-imports` path entry.
 *
 * @typedef {{ readonly name: string, readonly importNames?: readonly string[], readonly message?: string }} RestrictedImport
 */

/**
 * @typedef {object} TestAccess
 * @property {readonly string[]} categories File categories test files may also reach.
 * @property {BoundariesObject} [element] Element selector that limits where those files may live.
 */

/**
 * @typedef {object} CapabilityBoundariesOptions
 * @property {string} rootPath Absolute workspace root the descriptors are relative to.
 * @property {readonly ElementDescriptor[]} elements Capability and test-support elements.
 * @property {readonly string[]} files Source files the dependency and placement rules lint.
 * @property {readonly FileDescriptor[]} [roleDescriptors] Extra file descriptors, matched after
 *   the test category and before the role folders, such as `domain-api` public entries.
 * @property {readonly BoundariesObject[]} [additionalAllows] Policies placed after the shared
 *   allowances and before the invariant denials, so they can never override an invariant.
 * @property {readonly BoundariesObject[]} [additionalDenials] Policies placed after the invariant
 *   denials.
 * @property {readonly string[]} [policyExternalModules] External modules domain and application
 *   code may import.
 * @property {readonly RestrictedImport[]} [policyRestrictedImports] Extra imports domain and
 *   application code may not name.
 * @property {TestAccess} [testAccess] What test files may reach beyond the shared allowances.
 * @property {readonly string[]} [placementFiles] Files the placement rule checks; defaults to
 *   `files`.
 * @property {readonly string[]} [resolverConditions] Export conditions the TypeScript import
 *   resolver selects; the resolver's own defaults apply when absent.
 */

/** @param {string | readonly string[]} value */
const asList = (value) => (typeof value === "string" ? [value] : value);

/**
 * The file descriptors that classify capability files: tests (including every
 * `test-support` element), any declared role descriptors, then the domain,
 * application, adapters, and composition folders of each capability element.
 *
 * @param {readonly ElementDescriptor[]} elements
 * @param {readonly FileDescriptor[]} [declaredRoles]
 * @returns {FileDescriptor[]}
 */
export function capabilityFileRules(elements, declaredRoles = []) {
  /** @param {string} suffix */
  const inCapabilities = (suffix) =>
    elements.flatMap(({ pattern }) => asList(pattern).map((root) => `${root}/${suffix}`));
  return [
    {
      pattern: [
        ...elements
          .filter(({ type }) => type === "test-support")
          .flatMap(({ pattern }) => asList(pattern).map((root) => `${root}/**/*`)),
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
 * Flat-config entries that enforce capability boundaries with
 * `eslint-plugin-boundaries`: dependency direction between capabilities and
 * their domain, application, adapter, and composition files, placement of
 * capability code in those folders, and the absence of filesystem, provider,
 * and ambient process access from domain and application code.
 *
 * The plugin applies the last matching policy, so the order is shared
 * allowances, `additionalAllows`, invariant denials, then `additionalDenials`.
 *
 * @param {CapabilityBoundariesOptions} options
 * @returns {import("eslint").Linter.Config[]}
 */
export function capabilityBoundaries({
  rootPath,
  elements,
  files,
  roleDescriptors = [],
  additionalAllows = [],
  additionalDenials = [],
  policyExternalModules = [],
  policyRestrictedImports = [],
  testAccess,
  placementFiles = files,
  resolverConditions,
}) {
  const roots = elements
    .filter(({ type }) => type !== "test-support")
    .flatMap(({ pattern }) => asList(pattern));
  /** @param {string} suffix */
  const inCapabilities = (suffix) => roots.map((root) => `${root}/${suffix}`);
  const fileDescriptors = capabilityFileRules(elements, roleDescriptors);
  const testFiles = fileDescriptors
    .filter(({ category }) => category === "test")
    .flatMap(({ pattern }) => asList(pattern));
  /** @param {string} role */
  const roleFiles = (role) => inCapabilities(`${role}/**/*`);
  /** @param {readonly string[]} roles */
  const declaredRoleFiles = (roles) =>
    roleDescriptors
      .filter(({ category }) => asList(category).some((role) => roles.includes(role)))
      .flatMap(({ pattern }) => asList(pattern));
  const publicDomain = [
    { element: { fileInternalPath: `domain/index.${sourceExtension}` } },
    { file: { categories: "domain-api" } },
  ];
  const publicApplication = [
    { element: { fileInternalPath: `application/index.${sourceExtension}` } },
    { file: { categories: "application-api" } },
  ];
  const testAccessPolicies =
    testAccess === undefined
      ? []
      : [
          {
            from: { file: { categories: "test" } },
            allow: {
              to: {
                ...(testAccess.element === undefined ? {} : { element: testAccess.element }),
                file: { categories: testAccess.categories },
              },
            },
          },
        ];

  return [
    {
      name: "capabilities/dependencies",
      files: [...files],
      plugins: { boundaries },
      settings: {
        "boundaries/root-path": rootPath,
        "boundaries/elements": elements,
        "boundaries/files-single-match": true,
        "boundaries/files": fileDescriptors,
        "import/resolver": {
          typescript: {
            project: [],
            ...(resolverConditions === undefined ? {} : { conditionNames: resolverConditions }),
          },
        },
      },
      rules: {
        "boundaries/no-unknown-files": "error",
        "boundaries/no-unknown-dependencies": ["error", { require: "all" }],
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
                      source: [...policyExternalModules],
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
              ...testAccessPolicies,
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
              ...additionalAllows,
              // Invariant denials follow every allowance: this plugin uses
              // last-match precedence.
              {
                from: {
                  file: { categories: ["domain", "domain-api", "application", "application-api"] },
                },
                disallow: {
                  to: {
                    module: {
                      source: "effect",
                      internalPath: [
                        "FileSystem",
                        "{ai,cli,cluster,devtools,eventlog,http,http-api,net,observability,persistence,process,reactivity,rpc,schema,socket,sql,workers,workflow}{,/**}",
                        "encoding/{Ini,Ndjson,SchemaBinary,Sse,Toml,Yaml}",
                      ],
                    },
                  },
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
              ...additionalDenials,
            ],
          },
        ],
      },
    },
    {
      name: "capabilities/placement",
      files: [...placementFiles],
      ignores: [
        ...testFiles,
        ...roleFiles("domain"),
        ...roleFiles("application"),
        ...roleFiles("adapters"),
        ...roleFiles("composition"),
        ...roleDescriptors.flatMap(({ pattern }) => asList(pattern)),
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
              ...policyRestrictedImports,
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
