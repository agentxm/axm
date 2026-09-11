/**
 * @agentxm/extension-publish deterministic test ports and fixtures.
 *
 * Publishing is the one operation whose effects leave the workspace, so its
 * seams have to be real rather than stubbed: a `file://` Registry target whose
 * every upload lands as a file below one directory, so an empty
 * `storedFiles()` after a run is evidence that nothing was distributed; the
 * workspace-authored sources a publication selects from, written exactly as
 * their `new` command leaves them; and the authentication, Git-comparison and
 * transport ports a publish statically requires, bound to doubles that reach
 * neither the network nor a real keychain. Production source never imports
 * this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import {
  GitDirectoryComparison,
  type GitDirectoryComparisonService,
} from "@agentxm/extension-sources";
import { GitDirectoryComparisonTest } from "@agentxm/extension-sources/testing";
import {
  AuthClient,
  AuthLoginPresenter,
  DeviceLoginInteraction,
  PendingPublishAuthorizationStore,
} from "@agentxm/registry-auth";
import {
  AuthClientTest,
  AuthLoginPresenterTest,
  DeviceLoginInteractionTest,
  PendingPublishAuthorizationStoreTest,
} from "@agentxm/registry-auth/testing";
import { OfflineHttpClient } from "@agentxm/registry-client/testing";

import type { PublishableType } from "./publishable-types.js";
import type { PublishRequest } from "./publish/model.js";

/** The owner handle every authored fixture package declares. */
export const FIXTURE_OWNER = "@acme";

export interface PublishTarget {
  /** Absolute directory the Registry's files land in. */
  readonly root: string;
  /** `file://` URL for `registryUrl` on a publish request. */
  readonly url: string;
  /**
   * Every file the Registry holds, relative to its root, sorted. An empty list
   * after a run is the proof that nothing was distributed — a preview that
   * uploaded would show its archive here.
   */
  readonly storedFiles: () => ReadonlyArray<string>;
}

const walkFiles = (root: string, directory: string): ReadonlyArray<string> =>
  fs.existsSync(directory)
    ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = nodePath.join(directory, entry.name);
        return entry.isDirectory()
          ? walkFiles(root, absolute)
          : [nodePath.relative(root, absolute).split(nodePath.sep).join("/")];
      })
    : [];

/**
 * An empty `file://` Registry inside `workspaceRoot`, as the publish target.
 * It starts with no extensions at all, so a conflict a test needs must be
 * published into it first rather than assumed.
 */
export const makePublishTarget = (
  workspaceRoot: string,
  directoryName = "registry",
): PublishTarget => {
  const root = nodePath.join(workspaceRoot, directoryName);
  fs.mkdirSync(root, { recursive: true });
  return {
    root,
    url: pathToFileURL(root).href,
    storedFiles: () => [...walkFiles(root, root)].sort(),
  };
};

export interface AuthoredExtensionFixture {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  /** Publish-ignore patterns recorded in the manifest. */
  readonly publishIgnore?: ReadonlyArray<string>;
  /**
   * Omit the type's content document, so the fixed publication gate has a
   * genuine reason to refuse the package.
   */
  readonly withoutContent?: boolean;
  /** Member constraints keyed by fully qualified name; packs only. */
  readonly dependencies?: Readonly<Record<string, string>>;
}

/** The workspace directory each publishable type's authored packages live under. */
const authoredDirectory = {
  skill: "skills",
  "mcp-server": "mcps",
  subagent: "subagents",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const satisfies Record<PublishableType, string>;

/** The manifest filename each publishable type carries at its package root. */
const manifestFilename = {
  skill: "skill.json",
  "mcp-server": "mcp.json",
  subagent: "subagent.json",
  rule: "rule.json",
  hook: "hook.json",
  knowledge: "knowledge.json",
  pack: "pack.json",
} as const satisfies Record<PublishableType, string>;

/** The settings key each publishable type declares its authored entry under. */
export const authoredSettingsKey = {
  skill: "skills",
  "mcp-server": "mcpServers",
  subagent: "subagents",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
  pack: "packs",
} as const satisfies Record<PublishableType, string>;

const manifestBody = (
  type: PublishableType,
  fixture: AuthoredExtensionFixture,
  version: string,
  description: string,
): Readonly<Record<string, unknown>> => {
  const common = {
    owner: FIXTURE_OWNER,
    type,
    name: fixture.name,
    version,
    description,
    ...(fixture.publishIgnore === undefined ? {} : { publish: { ignore: fixture.publishIgnore } }),
  };
  switch (type) {
    case "mcp-server":
      return {
        ...common,
        server: {
          name: `ai.agentxm.spec/${fixture.name}`,
          description,
          version,
          packages: [
            {
              registryType: "npm",
              identifier: `${FIXTURE_OWNER}/${fixture.name}`,
              version,
              transport: { type: "stdio" },
            },
          ],
        },
      };
    case "hook":
      return {
        ...common,
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "tool.pre", match: { tools: ["file.write"] } }],
      };
    case "knowledge":
      return { ...common, format: { name: "okf", version: "0.2" }, bundleRoot: "src" };
    case "pack":
      return { ...common, dependencies: fixture.dependencies ?? {} };
    case "skill":
    case "subagent":
    case "rule":
      return common;
  }
};

const contentFiles = (
  type: PublishableType,
  fixture: AuthoredExtensionFixture,
  description: string,
): ReadonlyArray<readonly [relativePath: string, text: string]> => {
  switch (type) {
    case "skill":
      return [
        [
          nodePath.join("src", "SKILL.md"),
          `---\nname: ${fixture.name}\ndescription: ${description}\n---\n\n# ${fixture.name}\n\n${description}\n`,
        ],
      ];
    case "subagent":
      return [
        [
          nodePath.join("src", `${fixture.name}.md`),
          `---\nname: ${fixture.name}\ndescription: ${description}\n---\n\n# ${fixture.name}\n`,
        ],
      ];
    case "rule":
      return [[nodePath.join("src", "RULE.md"), `Guidance for ${fixture.name}: ${description}\n`]];
    case "hook":
      return [[nodePath.join("src", "hook.sh"), `#!/usr/bin/env bash\necho "${fixture.name}"\n`]];
    case "knowledge":
      return [
        [
          nodePath.join("src", "index.md"),
          `---\nokf_version: "0.2"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n`,
        ],
      ];
    case "mcp-server":
    case "pack":
      return [];
  }
};

/**
 * Writes one workspace-authored package of `type` under its authored
 * directory, laid out exactly as its `new` command leaves it: the manifest at
 * the package root and, for every type whose content is a document rather than
 * the manifest itself, the body under `src/`. Returns the package directory.
 *
 * Pair it with a settings entry — `{ [authoredSettingsKey[type]]: { [name]:
 * "workspace" } }` — so the workspace declares authorship of the package and
 * publish selection can reach it.
 */
export const writeAuthoredExtension = (
  workspaceRoot: string,
  type: PublishableType,
  fixture: AuthoredExtensionFixture,
): string => {
  const version = fixture.version ?? "1.0.0";
  const description = fixture.description ?? `The ${fixture.name} ${type}.`;
  const packageDir = nodePath.join(workspaceRoot, authoredDirectory[type], fixture.name);
  fs.mkdirSync(nodePath.join(packageDir, "src"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(packageDir, manifestFilename[type]),
    `${JSON.stringify(manifestBody(type, fixture, version, description), null, 2)}\n`,
  );
  if (fixture.withoutContent !== true) {
    for (const [relativePath, text] of contentFiles(type, fixture, description)) {
      fs.writeFileSync(nodePath.join(packageDir, relativePath), text);
    }
  }
  return packageDir;
};

/** Every port a publish statically requires beyond the workspace itself. */
export type PublishPorts =
  | AuthClient
  | AuthLoginPresenter
  | DeviceLoginInteraction
  | PendingPublishAuthorizationStore
  | GitDirectoryComparison
  | HttpClient.HttpClient;

export interface PublishPortsTestOptions {
  /** Registry answers for the auth client; defaults to the client's own. */
  readonly auth?: Parameters<typeof AuthClientTest>[0];
  /**
   * Git worktree comparison. The default reports no enclosing worktree, which
   * is the honest answer for a temporary fixture directory.
   */
  readonly compare?: GitDirectoryComparisonService["compare"];
}

/**
 * The authentication, Git-comparison and transport ports a publish requires,
 * bound to doubles that reach neither the network nor a real keychain.
 *
 * The transport refuses every request, so a publish to a `file://` target that
 * passes is simultaneously evidence that the exercised path never opened a
 * socket. A test that publishes to a remote Registry replaces the transport
 * with a recorded one from `@agentxm/registry-client/testing`.
 */
export const PublishPortsTest = (
  options: PublishPortsTestOptions = {},
): Layer.Layer<PublishPorts> =>
  Layer.mergeAll(
    AuthClientTest(options.auth),
    AuthLoginPresenterTest().layer,
    DeviceLoginInteractionTest().layer,
    PendingPublishAuthorizationStoreTest(),
    GitDirectoryComparisonTest(options.compare),
    OfflineHttpClient,
  );

/**
 * A publish request with non-interactive defaults: every extension of every
 * publishable type, previewed against `registryUrl`, with no existing-version
 * policy and no visibility override. Override only what the example is about.
 */
export const publishRequest = (
  registryUrl: string,
  overrides: Partial<PublishRequest> = {},
): PublishRequest => ({
  selectors: [],
  owners: [],
  types: [],
  excludes: [],
  registry: Option.none(),
  registryUrl: Option.some(registryUrl),
  onExisting: Option.none(),
  backfill: false,
  acceptWarnings: false,
  preview: true,
  scope: "project",
  visibility: Option.none(),
  includeDependencies: false,
  unattended: true,
  ...overrides,
});
