/**
 * @agentxm/workspace-inspection deterministic fixtures and ports.
 *
 * A throwaway workspace with settings, lockfile, and native files written as
 * the product writes them; the workspace-state services over it; a recorded
 * Registry port; and the coding-agent repository inspection reads. Production
 * source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { MANIFEST_FILENAME_BY_TYPE } from "@agentxm/extension-content";
import { SourceHostProviders } from "@agentxm/extension-sources";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  RegistryClientFactory,
  RegistryUrl,
  makeRegistryClientFactory,
} from "@agentxm/registry-client";
import {
  CodingAgentRepositoryLive,
  WorkspaceCatalogLive,
} from "@agentxm/workspace-projection/live";
import {
  ConfiguredAgentOutcomesProviderTest,
  makeRegistryPackLockEntry,
  makeRegistrySkillLockEntry,
} from "@agentxm/workspace-state/testing";
import { WorkspaceStateLive } from "@agentxm/workspace-state/live";

export const inspectionRegistryUrl = "https://inspection-registry.example.test";

export interface ObservedRegistryRequest {
  readonly method: string;
  readonly url: string;
  readonly hasAuthorization: boolean;
}

export interface RegistryResponseFixture {
  readonly status?: number;
  readonly body: unknown;
}

/** A recorded Registry port: every request observed, every answer supplied. */
export const makeRecordedRegistryPort = (
  respond: (request: ObservedRegistryRequest) => RegistryResponseFixture,
) => {
  const requests: Array<ObservedRegistryRequest> = [];
  const firstRequest = Deferred.makeUnsafe<void>();
  const httpClient = HttpClient.make((request) =>
    Effect.gen(function* () {
      const observed: ObservedRegistryRequest = {
        method: request.method,
        url: request.url,
        hasAuthorization: request.headers["authorization"] !== undefined,
      };
      requests.push(observed);
      yield* Deferred.succeed(firstRequest, undefined);
      const fixture = respond(observed);
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(fixture.body), {
          status: fixture.status ?? 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  const layer = Layer.effect(
    RegistryClientFactory,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const defaultRegistryLocation = yield* RegistryUrl;
      return makeRegistryClientFactory({
        httpClient,
        fileSystem,
        path,
        defaultRegistryLocation,
      });
    }),
  );
  return { requests, httpClient, layer, firstRequest: Deferred.await(firstRequest) };
};

export interface InspectionFixtureOptions {
  readonly scope?: WorkspaceScope;
  /** Settings document for the selected scope; written as authored. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Lockfile document for the selected scope; `lockfileVersion` is supplied. */
  readonly lockfile?: Readonly<Record<string, unknown>>;
  /** Extra files written into the workspace root, keyed by relative path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Registry answers for a recorded port; omit for a workspace-only fixture. */
  readonly respond?: (request: ObservedRegistryRequest) => RegistryResponseFixture;
}

/** A throwaway workspace with the services inspection queries need over it. */
export const makeInspectionFixture = (options: InspectionFixtureOptions = {}) => {
  const scope = options.scope ?? "project";
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-inspection-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-inspection-home-")));
  const workspaceRoot = scope === "user" ? nodePath.join(home, ".axm", "workspace") : root;
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.mkdirSync(nodePath.join(home, ".axm", "workspace"), { recursive: true });

  const writeFile = (relativePath: string, contents: string) => {
    const file = nodePath.join(root, relativePath);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  const readFile = (relativePath: string): string =>
    fs.readFileSync(nodePath.join(root, relativePath), "utf8");
  const exists = (relativePath: string): boolean =>
    fs.existsSync(nodePath.join(root, relativePath));
  const remove = (relativePath: string): void =>
    fs.rmSync(nodePath.join(root, relativePath), { force: true });

  /** Every file under the workspace, so a read-only query can be shown to write nothing. */
  const snapshot = (): ReadonlyArray<readonly [string, string]> => {
    const entries: Array<readonly [string, string]> = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = nodePath.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else entries.push([nodePath.relative(root, absolute), fs.readFileSync(absolute, "utf8")]);
      }
    };
    walk(root);
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  };

  if (options.settings !== undefined) {
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm.json"),
      JSON.stringify({ agents: [], ...options.settings }, null, 2),
    );
    // JSON is valid YAML, so the lockfile fixture needs no emitter.
    fs.writeFileSync(
      nodePath.join(workspaceRoot, "axm-lock.yaml"),
      JSON.stringify({ lockfileVersion: 7, skills: {}, ...options.lockfile }),
    );
  }
  for (const [relativePath, contents] of Object.entries(options.files ?? {}))
    writeFile(relativePath, contents);

  // A recorded port is always present, so a fixture can assert that a refusal
  // happened before any Registry request.
  const registry = makeRecordedRegistryPort(
    options.respond ??
      (() => ({
        status: 404,
        body: {
          kind: "NotFoundError",
          type: "about:blank",
          title: "Extension not found",
          status: 404,
          code: "extension_not_found",
          detail: "Fixture extension not found",
        },
      })),
  );

  const environment = Layer.mergeAll(
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
    Layer.succeed(RegistryUrl, inspectionRegistryUrl),
  );
  const transport = Layer.succeed(HttpClient.HttpClient, registry.httpClient);
  // Registry assessment is exercised through the recorded port; Git host
  // discovery has no source to reach in these fixtures.
  const sourceProviders = Layer.succeed(SourceHostProviders, {
    find: () => Effect.succeed([]),
    resolveNamedRegistry: () => Effect.die("no named registry in this fixture"),
    fetch: () => Effect.die("no source fetch in this fixture"),
    cloneUrl: () => Option.none(),
    origin: () => "fixture",
  });
  const workspaceState = Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceStateLive({
        scope,
        projectRoot: decodeAbsolutePathSync(root),
        allowUninitialized: options.settings === undefined,
      }),
      CodingAgentRepositoryLive,
      ConfiguredAgentOutcomesProviderTest,
      transport,
      sourceProviders,
      registry.layer,
    ),
    environment,
  );
  // The catalog identifier resolution consults sits over the same workspace.
  const catalog = Layer.provide(WorkspaceCatalogLive, workspaceState);

  return {
    root,
    home,
    workspaceRoot,
    writeFile,
    readFile,
    exists,
    remove,
    snapshot,
    requests: registry.requests,
    firstRequest: registry.firstRequest,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provide(catalog),
        Effect.provide(transport),
        Effect.provide(workspaceState),
      ),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};

export type InspectionFixture = ReturnType<typeof makeInspectionFixture>;

/** A published skill index, as the Registry returns it. */
export interface PublishedSkillIndex {
  readonly versions: ReadonlyArray<{ readonly version: string; readonly published: string }>;
  readonly deprecation?: unknown;
}

export const publishedSkillIndex = (index: PublishedSkillIndex): unknown => ({
  owner: "@acme",
  type: "skill",
  name: "review",
  description: "Review guidance",
  publisher_binding_id: "hbnd_inspection_fixture",
  visibility: "public",
  deprecation: index.deprecation ?? null,
  versions: index.versions.map((entry) => ({ ...entry, integrity: "sha512-AAAA==" })),
});

/**
 * One accepted Registry skill, physically present, recorded against a named
 * Registry source the fixture's recorded port answers for.
 */
export const makeInstalledSkillFixture = (
  options: {
    readonly enabled?: boolean;
    readonly versionRange?: string;
    readonly sources?: ReadonlyArray<unknown>;
    readonly index?: PublishedSkillIndex;
    readonly respond?: (request: ObservedRegistryRequest) => RegistryResponseFixture;
  } = {},
) => {
  const current = {
    index: options.index ?? {
      versions: [{ version: "1.0.0", published: "2026-01-01T00:00:00.000Z" }],
    },
  };
  const fixture = makeInspectionFixture({
    settings: {
      agents: ["claude-code"],
      sources: options.sources ?? [
        { name: "company", type: "registry", location: inspectionRegistryUrl },
      ],
      skills: {
        review: {
          source: `company:@acme/skills/review@${options.versionRange ?? "^1.0.0"}`,
          enabled: options.enabled ?? true,
        },
      },
    },
    lockfile: {
      skills: {
        review: makeRegistrySkillLockEntry({
          owner: decodeHandleSync("@acme"),
          name: "review",
          sourceName: "company",
          endpoint: new URL(inspectionRegistryUrl),
        }),
      },
    },
    files: {
      "agent_extensions/company/@acme/skills/review/SKILL.md":
        "---\nname: review\ndescription: Review guidance\n---\n# Review\n",
    },
    respond: options.respond ?? (() => ({ body: publishedSkillIndex(current.index) })),
  });
  return {
    ...fixture,
    /** Republish the extension index the recorded port answers with. */
    publish: (index: PublishedSkillIndex) => {
      current.index = index;
    },
  };
};

/** Minimal YAML emitter for fixture frontmatter: scalars and string arrays. */
const yamlFrontmatter = (values: Readonly<Record<string, unknown>>): string =>
  Object.entries(values)
    .map(([key, value]) =>
      Array.isArray(value)
        ? `${key}:\n${value.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}\n`
        : `${key}: ${JSON.stringify(value)}\n`,
    )
    .join("");

/** An OKF concept document with fixture frontmatter and the given body. */
export const knowledgeDocument = (
  body: string,
  frontmatter: Readonly<Record<string, unknown>> = {},
): string =>
  `---\n${yamlFrontmatter({ type: "guide", description: "Fixture guidance", tags: ["fixture"], ...frontmatter })}---\n${body}`;

export interface KnowledgeInventoryBundle {
  readonly name: string;
  readonly enabled?: boolean;
  readonly instructionEntry?: boolean;
  readonly manifestInstructionEntry?: boolean;
  readonly documents?: Readonly<Record<string, string>>;
}

/** A workspace whose Knowledge bundles are authored in place, as `axm knowledge new` leaves them. */
export const makeKnowledgeInventoryFixture = (options: {
  readonly bundles: ReadonlyArray<KnowledgeInventoryBundle>;
  readonly instructionFiles?: boolean;
  readonly knowledgeInstructions?: boolean;
}) => {
  const files: Record<string, string> = {};
  for (const bundle of options.bundles) {
    files[`knowledge/${bundle.name}/knowledge.json`] = JSON.stringify({
      owner: "@acme",
      type: "knowledge",
      name: bundle.name,
      version: "1.0.0",
      description: "Fixture Knowledge bundle",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
      ...(bundle.manifestInstructionEntry === undefined
        ? {}
        : { instructionEntry: bundle.manifestInstructionEntry }),
    });
    files[`knowledge/${bundle.name}/src/index.md`] =
      '---\nokf_version: "0.2"\n---\n# Fixture knowledge\n';
    for (const [relativePath, content] of Object.entries(bundle.documents ?? {}))
      files[`knowledge/${bundle.name}/src/${relativePath}`] = content;
  }
  const fixture = makeInspectionFixture({
    settings: {
      agents: [],
      owner: "@acme",
      instructionFiles:
        options.instructionFiles === false
          ? false
          : { fileName: "AGENTS.md", gitignoreAliases: false },
      knowledgeConfig: { instructions: options.knowledgeInstructions !== false },
      knowledge: Object.fromEntries(
        options.bundles.map((bundle) => [
          bundle.name,
          {
            source: "workspace",
            enabled: bundle.enabled ?? true,
            ...(bundle.instructionEntry === undefined
              ? {}
              : { instructionEntry: bundle.instructionEntry }),
          },
        ]),
      ),
    },
    files,
  });
  return {
    ...fixture,
    sourceRoot: (bundle: string) => nodePath.join(fixture.root, "knowledge", bundle, "src"),
    writeDocument: (bundle: string, relativePath: string, content: string) =>
      fixture.writeFile(`knowledge/${bundle}/src/${relativePath}`, content),
  };
};

/** A workspace-authored pack, as `axm packs new` plus `axm packs add` leave it. */
export const makeAuthoredPackFixture = (
  options: {
    readonly name?: string;
    readonly version?: string;
    readonly dependencies?: Readonly<Record<string, string>>;
  } = {},
) => {
  const name = options.name ?? "toolkit";
  const dependencies = options.dependencies ?? {};
  const manifest = {
    owner: "@acme",
    type: "pack",
    name,
    version: options.version ?? "0.0.1",
    description: "Fixture pack",
    dependencies,
  };
  return makeInspectionFixture({
    settings: {
      agents: [],
      owner: "@acme",
      packs: { [name]: { source: "workspace", enabled: true } },
      skills: Object.fromEntries(
        Object.keys(dependencies).map((fqn) => [
          fqn.split("/").at(-1) ?? fqn,
          { source: fqn, enabled: true },
        ]),
      ),
    },
    files: { [`packs/${name}/pack.json`]: JSON.stringify(manifest, null, 2) },
  });
};

/** A Registry pack the workspace has accepted at an exact version. */
export const makeAcceptedPackFixture = (
  options: { readonly name?: string; readonly version?: string } = {},
) => {
  const name = options.name ?? "toolkit";
  const version = options.version ?? "2.3.4";
  const manifest = {
    owner: "@acme",
    type: "pack",
    name,
    version,
    description: "Fixture pack",
    dependencies: {},
  };
  return makeInspectionFixture({
    settings: {
      agents: [],
      sources: [{ name: "agentxm", type: "registry", location: inspectionRegistryUrl }],
      packs: { [name]: { source: `@acme/packs/${name}@${version}`, enabled: true } },
    },
    lockfile: {
      packs: {
        [name]: makeRegistryPackLockEntry({
          owner: decodeHandleSync("@acme"),
          name,
          resolvedVersion: decodeVersionSync(version),
          endpoint: new URL(inspectionRegistryUrl),
        }),
      },
    },
    files: {
      [`agent_extensions/agentxm/@acme/packs/${name}/pack.json`]: JSON.stringify(manifest, null, 2),
    },
  });
};

/**
 * Every extension type a person can author in a workspace. Packs are members
 * of this set: `axm packs new` writes one the same way.
 */
export const AUTHORING_TYPES = [
  "skill",
  "mcp-server",
  "subagent",
  "rule",
  "hook",
  "knowledge",
  "pack",
] as const;

export type AuthoringType = (typeof AUTHORING_TYPES)[number];

/** The workspace directory each authored type's packages live under. */
const authoredDirectory = {
  skill: "skills",
  "mcp-server": "mcps",
  subagent: "subagents",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const satisfies Record<AuthoringType, string>;

/** Workspace-relative manifest path of an authored package of this type. */
export const authoredManifestPath = (type: AuthoringType, name: string): string =>
  `${authoredDirectory[type]}/${name}/${MANIFEST_FILENAME_BY_TYPE[type]}`;

/**
 * One workspace-authored extension package, laid out exactly as its `new`
 * command leaves it: the manifest at the package root, and — for every type
 * whose content is a document rather than the manifest itself — the body under
 * `src/`. The read model discovers an authored package by that layout, so a
 * fixture that flattened it would be describing a workspace the product never
 * writes.
 */
export const authoredExtensionFiles = (
  type: AuthoringType,
  name: string,
  version = "1.2.3",
): Readonly<Record<string, string>> => {
  const manifest = (extra: Readonly<Record<string, unknown>> = {}) =>
    JSON.stringify(
      { owner: "@acme", type, name, version, description: `Fixture ${type}`, ...extra },
      null,
      2,
    );
  switch (type) {
    case "skill":
      return {
        [authoredManifestPath(type, name)]: manifest(),
        [`skills/${name}/src/SKILL.md`]: `---\nname: ${name}\ndescription: Fixture skill\n---\n# ${name}\n`,
      };
    case "mcp-server":
      return {
        [authoredManifestPath(type, name)]: manifest({
          server: {
            name: `io.github.example/${name}`,
            description: `Fixture ${name} server`,
            version,
            packages: [
              {
                registryType: "npm",
                identifier: name,
                version,
                transport: { type: "stdio" },
              },
            ],
          },
        }),
      };
    case "subagent":
      return {
        [authoredManifestPath(type, name)]: manifest(),
        [`subagents/${name}/src/${name}.md`]: `---\nname: ${name}\n---\n\nFixture subagent.\n`,
      };
    case "rule":
      return {
        [authoredManifestPath(type, name)]: manifest({ title: `Fixture ${name}` }),
        [`rules/${name}/src/RULE.md`]: `# Fixture ${name}\n\nFixture rule body.\n`,
      };
    case "hook":
      return {
        [authoredManifestPath(type, name)]: manifest({
          runtime: "bash",
          entrypoint: "src/hook.sh",
          bindings: [{ on: "tool.pre", matcherRaw: "Write|Edit" }],
        }),
        [`hooks/${name}/src/hook.sh`]: "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n",
      };
    case "knowledge":
      return {
        [authoredManifestPath(type, name)]: manifest({
          format: { name: "okf", version: "0.2" },
          bundleRoot: "src",
        }),
        [`knowledge/${name}/src/index.md`]: '---\nokf_version: "0.2"\n---\n# Fixture\n',
      };
    case "pack":
      return {
        [authoredManifestPath(type, name)]: manifest({ dependencies: {} }),
      };
  }
};

/** The settings key each authored type declares its entry under. */
const authoredSettingsKey = {
  skill: "skills",
  "mcp-server": "mcpServers",
  subagent: "subagents",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const satisfies Record<AuthoringType, string>;

/** A workspace with one authored extension of the given type, configured and present. */
export const makeAuthoredExtensionFixture = (
  type: AuthoringType,
  name = "example",
  version = "1.2.3",
) =>
  makeInspectionFixture({
    settings: {
      agents: ["claude-code"],
      owner: "@acme",
      [authoredSettingsKey[type]]: { [name]: { source: "workspace", enabled: true } },
    },
    files: authoredExtensionFiles(type, name, version),
  });
