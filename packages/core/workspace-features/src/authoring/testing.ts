/**
 * @agentxm/workspace-features/authoring deterministic test fixtures.
 *
 * A throwaway project workspace on a temporary directory, the per-type
 * creation request an authoring command is admitted with, and the minimal
 * valid package of each type that the scaffolds here define the shape of.
 *
 * The fixture is deliberately platform-free: composing the file system, the
 * transport and the managers is the consumer's job, exactly as it is the
 * application's, so this module stays importable from a published package
 * rather than dragging a Node-only platform layer behind it. What it does own
 * is the shape of an authored workspace on disk and the byte-exact snapshot a
 * purity example compares against — two snapshots are equal only when every
 * path and every byte is unchanged, so a preview that wrote anything at all
 * fails rather than passing on a coarse comparison.
 *
 * Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as fs from "node:fs";
import { snapshotPath } from "@agentxm/workspace-kernel/workspace-state/testing";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Option from "effect/Option";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { HOOK_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import {
  KNOWLEDGE_MANIFEST_SCHEMA_URL,
  KNOWLEDGE_SOURCE_DIR,
} from "@agentxm/extension-model/unstable/knowledge";
import { MCP_SERVER_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { PACK_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import {
  RULE_BODY_FILENAME,
  RULE_MANIFEST_SCHEMA_URL,
} from "@agentxm/extension-model/unstable/rules/manifest-schema";
import { MANIFEST_SCHEMA_URL as SKILL_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import { MANIFEST_SCHEMA_URL as SUBAGENT_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/subagents/manifest-schema";

import type { CreatableExtensionType, CreateExtensionRequest } from "./create/create-extension.js";
import { hookEntrypointFilename } from "./create/scaffolds/hook.js";
import { manifestText } from "./create/scaffolds/scaffold.js";

/** Settings an authoring example seeds its workspace with. */
export interface AuthoringWorkspaceSettings {
  readonly owner?: string;
  readonly agents?: ReadonlyArray<string>;
}

export interface AuthoringWorkspace {
  /** Absolute project root the workspace is anchored to. */
  readonly root: string;
  /** Read a workspace-relative file, or `undefined` when it is absent. */
  readonly read: (relativePath: string) => string | undefined;
  /** Write a workspace-relative file, creating parents. */
  readonly write: (relativePath: string, contents: string) => void;
  /** Whether a workspace-relative path exists. */
  readonly exists: (relativePath: string) => boolean;
  /** The decoded settings document. */
  readonly settings: () => unknown;
  /** Replace the settings document wholesale. */
  readonly writeSettings: (value: unknown) => void;
  /** The lockfile text, or an empty string when there is none. */
  readonly lockfileText: () => string;
  /** Every workspace-relative path that exists, sorted. */
  readonly tree: () => ReadonlyArray<string>;
  /**
   * Byte-exact content of a subtree: workspace-relative path mapped to
   * `"directory"` or `"file:<base64>"`. A missing root snapshots empty.
   */
  readonly snapshot: (relativePath?: string) => Readonly<Record<string, string>>;
  readonly cleanup: () => void;
}

const walk = (root: string, directory: string): ReadonlyArray<string> => {
  const entries = fs.existsSync(directory)
    ? fs.readdirSync(directory, { withFileTypes: true })
    : [];
  return entries.flatMap((entry) => {
    const absolute = nodePath.join(directory, entry.name);
    const relative = nodePath.relative(root, absolute);
    return entry.isDirectory() ? walk(root, absolute) : [relative];
  });
};

/**
 * A temporary project workspace whose settings name an owner and the agents
 * it configures, initialized the way `axm setup` leaves a project.
 */
export const makeAuthoringWorkspace = (
  settings: AuthoringWorkspaceSettings = {},
): AuthoringWorkspace => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-authoring-")));
  const absolute = (relativePath: string) => nodePath.join(root, relativePath);
  const writeSettings = (value: unknown): void => {
    fs.writeFileSync(absolute("axm.json"), `${JSON.stringify(value, null, 2)}\n`);
  };
  writeSettings({
    ...(settings.owner === undefined ? {} : { owner: settings.owner }),
    agents: settings.agents ?? [],
  });

  const snapshot = (relativePath = "."): Readonly<Record<string, string>> =>
    snapshotPath(absolute(relativePath));

  return {
    root,
    read: (relativePath) =>
      fs.existsSync(absolute(relativePath))
        ? fs.readFileSync(absolute(relativePath), "utf-8")
        : undefined,
    write: (relativePath, contents) => {
      const target = absolute(relativePath);
      fs.mkdirSync(nodePath.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    },
    exists: (relativePath) => fs.existsSync(absolute(relativePath)),
    settings: () => JSON.parse(fs.readFileSync(absolute("axm.json"), "utf-8")),
    writeSettings,
    lockfileText: () =>
      fs.existsSync(absolute("axm.lock")) ? fs.readFileSync(absolute("axm.lock"), "utf-8") : "",
    tree: () => [...walk(root, root)].sort(),
    snapshot,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};

/**
 * The creation request for one extension type, with the per-type options an
 * example does not vary.
 *
 * The rules that sweep every type — create-only refusal, workspace ownership —
 * are about what creation shares, not about what each scaffold takes, so the
 * type-specific fields are supplied once here rather than in every example.
 */
export const createRequestFor = (
  type: CreatableExtensionType,
  name: string,
  owner: Option.Option<string> = Option.none(),
): CreateExtensionRequest => {
  switch (type) {
    case "skill":
      return { type, name, owner };
    case "subagent":
      return { type, name, owner };
    case "pack":
      return { type, name, owner };
    case "rule":
      return { type, name, owner, title: Option.none() };
    case "knowledge":
      return { type, name, owner, description: Option.none() };
    case "hook":
      return {
        type,
        name,
        owner,
        runtime: "bash",
        protocol: "claude-code",
        event: "PreToolUse",
        matcher: Option.none(),
      };
    case "mcp-server":
      return { type, name, owner, description: Option.none(), nonInteractive: true };
  }
};

/** Every extension type a person can author in a workspace. */
export const CREATABLE_TYPES = [
  "skill",
  "mcp-server",
  "subagent",
  "rule",
  "hook",
  "knowledge",
  "pack",
] as const satisfies ReadonlyArray<CreatableExtensionType>;

/** What a minimal package is called and how it identifies itself. */
export interface MinimalPackageOptions {
  readonly name: string;
  /** Defaults to `@acme`. */
  readonly owner?: string;
  /** Defaults to `1.0.0`. */
  readonly version?: string;
  /** Defaults to `The <name> <type>.` */
  readonly description?: string;
  /**
   * The prose of the type's entry document. Defaults to the description, or
   * for a rule to guidance naming the rule; types whose content is the
   * manifest itself ignore it.
   */
  readonly body?: string;
  /** A license the manifest declares; omitted by default. */
  readonly license?: string;
}

const typeNoun: Record<ExtensionType, string> = {
  skill: "skill",
  "mcp-server": "MCP server",
  subagent: "subagent",
  rule: "rule",
  hook: "hook",
  knowledge: "knowledge bundle",
  pack: "pack",
};

const manifestSchemaUrl: Record<ExtensionType, string> = {
  skill: SKILL_MANIFEST_SCHEMA_URL,
  "mcp-server": MCP_SERVER_MANIFEST_SCHEMA_URL,
  subagent: SUBAGENT_MANIFEST_SCHEMA_URL,
  rule: RULE_MANIFEST_SCHEMA_URL,
  hook: HOOK_MANIFEST_SCHEMA_URL,
  knowledge: KNOWLEDGE_MANIFEST_SCHEMA_URL,
  pack: PACK_MANIFEST_SCHEMA_URL,
};

/**
 * The manifest and source files of a minimal valid package of `type`, keyed
 * by package-relative path, with no workspace layout around them.
 *
 * A package has the shape the type's scaffold gives it, the same manifest file
 * and entry document that `new` writes, reduced to what validation requires.
 * Where the package sits, and any file an example adds beside it, belong to
 * the caller.
 */
export const minimalPackageFiles = (
  type: ExtensionType,
  options: MinimalPackageOptions,
): Readonly<Record<string, string>> => {
  const { name } = options;
  const owner = options.owner ?? "@acme";
  const version = options.version ?? "1.0.0";
  const description = options.description ?? `The ${name} ${typeNoun[type]}.`;
  const common = {
    $schema: manifestSchemaUrl[type],
    owner,
    type,
    name,
    version,
    description,
    ...(options.license === undefined ? {} : { license: options.license }),
  };
  const manifestFile = manifestFilenameForType(type);
  switch (type) {
    case "skill":
      return {
        [manifestFile]: manifestText(common),
        "src/SKILL.md": `---\nname: "${name}"\ndescription: "${description}"\n---\n\n# ${name}\n\n${options.body ?? description}\n`,
      };
    case "subagent":
      return {
        [manifestFile]: manifestText({ ...common, core: { instructions: `src/${name}.md` } }),
        [`src/${name}.md`]: `# ${name}\n\n${options.body ?? description}\n`,
      };
    case "rule":
      return {
        [manifestFile]: manifestText(common),
        [`src/${RULE_BODY_FILENAME}`]: `${options.body ?? `Guidance for ${name}: ${description}`}\n`,
      };
    case "hook": {
      const entrypoint = `src/${hookEntrypointFilename("bash")}`;
      return {
        [manifestFile]: manifestText({
          ...common,
          implementations: ["claude-code", "codex"].map((protocol) => ({
            id: protocol,
            protocol,
            bindings: [
              {
                id: "audit",
                event: "PreToolUse",
                matcher: "Write|Edit",
                handler: { type: "command", runtime: "bash", entrypoint },
              },
            ],
          })),
        }),
        [entrypoint]: `#!/usr/bin/env bash\necho "${name}"\n`,
      };
    }
    case "knowledge":
      return {
        [manifestFile]: manifestText({
          ...common,
          format: { name: "okf", version: "0.2" },
          bundleRoot: KNOWLEDGE_SOURCE_DIR,
        }),
        [`${KNOWLEDGE_SOURCE_DIR}/index.md`]: `---\nokf_version: "0.2"\ndescription: "${description}"\n---\n\n# ${name}\n${options.body === undefined ? "" : `\n${options.body}\n`}`,
      };
    case "mcp-server":
      return {
        [manifestFile]: manifestText({
          ...common,
          server: {
            name: `io.github.example/${name}`,
            description,
            version,
            packages: [
              {
                registryType: "npm",
                identifier: `${owner}/${name}`,
                version,
                transport: { type: "stdio" },
              },
            ],
          },
        }),
      };
    case "pack":
      return { [manifestFile]: manifestText({ ...common, dependencies: {} }) };
  }
};
