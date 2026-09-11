/**
 * @agentxm/extension-authoring deterministic test fixtures.
 *
 * A throwaway project workspace on a temporary directory, and the per-type
 * creation request an authoring command is admitted with.
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
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Option from "effect/Option";

import type { CreatableExtensionType, CreateExtensionRequest } from "./create/create-extension.js";

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

  const snapshot = (relativePath = "."): Readonly<Record<string, string>> => {
    const target = absolute(relativePath);
    const entries: Record<string, string> = {};
    if (!fs.existsSync(target)) return entries;
    if (!fs.statSync(target).isDirectory()) {
      entries["."] = `file:${fs.readFileSync(target).toString("base64")}`;
      return entries;
    }
    const visit = (directory: string): void => {
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
        const child = nodePath.join(directory, entry.name);
        const relative = nodePath.relative(target, child);
        if (entry.isDirectory()) {
          entries[relative] = "directory";
          visit(child);
        } else {
          entries[relative] = `file:${fs.readFileSync(child).toString("base64")}`;
        }
      }
    };
    visit(target);
    return entries;
  };

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
      fs.existsSync(absolute("axm-lock.yaml"))
        ? fs.readFileSync(absolute("axm-lock.yaml"), "utf-8")
        : "",
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
      return { type, name, owner, runtime: "bash", event: "tool.pre", matcher: Option.none() };
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
