/* eslint-disable @typescript-eslint/consistent-type-assertions */
/**
 * Apply per-extension `Operation` intents to a `WorkspaceState` test double.
 *
 * The lint determinism harness (task 3c.19) needs: given a `WorkspaceState`
 * plus a set of autofix Operations, produce the post-apply state and re-run
 * the rule's `check`. This module is the pure reducer that maps an
 * Operation intent onto state mutations that approximate what the canonical
 * `OperationHandler` would do:
 *
 * - `install-skill` — add a skills lock entry, ensure the canonical
 *   `src/SKILL.md` probe exists, ensure per-declared-agent artifact paths
 *   exist (if the skill is enabled).
 * - `uninstall-skill` — remove the lock entry, remove the install-dir
 *   probes, remove per-agent artifacts.
 * - `enable-skill` / `disable-skill` — toggle per-agent artifact presence.
 * - `install-pack` / `uninstall-pack` — add/remove the pack lock entry.
 * - Other families (`-command`, `-mcp-server`, `-subagent`) are stubs for
 *   the harness; today no v1 rule emits those.
 *
 * The reducer writes **raw JSON-compatible shapes** into
 * `state.lockfile` — the accessor returns `LockfileDocument = unknown`, so
 * rules decode via `LockfileSchema` locally and the harness only needs to
 * satisfy the schema post-apply.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Operation } from "../../../plan/plan.js";
import type { AgentDescriptor } from "../../../agents/types.js";
import { AGENTS } from "../../../agents/registry.js";
import type {
  DisableSkillIntent,
  EnableSkillIntent,
  InstallPackIntent,
  InstallSkillIntent,
  UninstallPackIntent,
  UninstallSkillIntent,
} from "../workspace/helpers/install-ops.js";
import { parseRegistrySource } from "../workspace/helpers/registry-source.js";

export interface WorkspaceState {
  settings: unknown;
  lockfile: unknown;
  readonly existingPaths: Set<string>;
  readonly writablePaths: Set<string>;
  readonly listings: Map<string, Array<string>>;
  readonly detectedProjectAgents: Set<string>;
}

export const emptyWorkspaceState = (): WorkspaceState => ({
  settings: undefined,
  lockfile: undefined,
  existingPaths: new Set(),
  writablePaths: new Set(),
  listings: new Map(),
  detectedProjectAgents: new Set(),
});

// -----------------------------------------------------------------------------
// Fixed-at-test-time now() — keeps lockfile `installedAt`/`updatedAt` stable.
// -----------------------------------------------------------------------------

const FIXED_NOW_ISO = "2026-04-21T00:00:00.000Z";

// -----------------------------------------------------------------------------
// Raw shape helpers
// -----------------------------------------------------------------------------

type RawSettings = Readonly<Record<string, unknown>> & {
  readonly agents?: ReadonlyArray<string>;
  readonly skills?: Record<string, unknown>;
};

interface RawRegistrySkillEntry {
  readonly type: "registry";
  readonly owner: string;
  readonly name: string;
  readonly resolvedVersion: string;
  readonly integrity: string;
  readonly sourceName: string;
  readonly agents: ReadonlyArray<string>;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly sourceHash?: string;
  readonly retainedByPack?: boolean;
}

interface RawLocalSkillEntry {
  readonly type: "local";
  readonly path: string;
  readonly agents: ReadonlyArray<string>;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly sourceHash?: string;
}

type RawSkillEntry = RawRegistrySkillEntry | RawLocalSkillEntry;

interface RawPackEntry {
  readonly type: "registry";
  readonly owner: string;
  readonly name: string;
  readonly resolvedVersion: string;
  readonly integrity: string;
  readonly sourceName: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly resolvedSkills: Record<string, string>;
  readonly resolvedCommands: Record<string, string>;
  readonly resolvedMcpServers: Record<string, string>;
  readonly resolvedSubagents: Record<string, string>;
}

interface RawLockfile {
  readonly lockfileVersion: number;
  skills: Record<string, RawSkillEntry>;
  commands?: Record<string, unknown>;
  subagents?: Record<string, unknown>;
  mcpServers?: Record<string, unknown>;
  packs?: Record<string, RawPackEntry>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asLockfile = (doc: unknown): RawLockfile => {
  if (!isRecord(doc) || !("lockfileVersion" in doc)) {
    return { lockfileVersion: 1, skills: {} };
  }
  const version = doc["lockfileVersion"];
  const skills = doc["skills"];
  const commands = doc["commands"];
  const subagents = doc["subagents"];
  const mcpServers = doc["mcpServers"];
  const packs = doc["packs"];
  const result: RawLockfile = {
    lockfileVersion: typeof version === "number" ? version : 1,
    skills: isRecord(skills) ? { ...(skills as Record<string, RawSkillEntry>) } : {},
    ...(isRecord(commands) ? { commands: { ...commands } } : {}),
    ...(isRecord(subagents) ? { subagents: { ...subagents } } : {}),
    ...(isRecord(mcpServers) ? { mcpServers: { ...mcpServers } } : {}),
    ...(isRecord(packs) ? { packs: { ...(packs as Record<string, RawPackEntry>) } } : {}),
  };
  return result;
};

const asSettings = (doc: unknown): RawSettings | undefined =>
  isRecord(doc) ? (doc as RawSettings) : undefined;

const declaredAgents = (settings: RawSettings | undefined): ReadonlyArray<AgentDescriptor> => {
  if (settings === undefined || settings.agents === undefined) {
    return [];
  }
  const ids = new Set(settings.agents);
  return Object.values(AGENTS).filter((a) => ids.has(a.id));
};

const artifactPath = (agent: AgentDescriptor, skillName: string): string =>
  `${agent.skills.dir}/${skillName}`;

const registrySkillProbe = (owner: string, name: string): string =>
  `.axm/extensions/${owner}/skills/${name}/src/SKILL.md`;

const externalSkillProbe = (name: string): string =>
  `.axm/extensions/external/skills/${name}/SKILL.md`;

const registryPackProbe = (owner: string, name: string): string =>
  `.axm/extensions/${owner}/packs/${name}/pack.json`;

const readEnabled = (settings: RawSettings | undefined, skillName: string): boolean => {
  const skills = settings?.skills;
  if (skills === undefined) {
    return true;
  }
  const entry = skills[skillName];
  if (entry === undefined) {
    return true;
  }
  if (typeof entry === "string") {
    return true;
  }
  if (typeof entry === "object" && entry !== null && "enabled" in entry) {
    const value = (entry as { enabled?: unknown }).enabled;
    return value === undefined ? true : value === true;
  }
  return true;
};

// -----------------------------------------------------------------------------
// Intent → state reducers
// -----------------------------------------------------------------------------

export const applyInstallSkill = (state: WorkspaceState, intent: InstallSkillIntent): void => {
  const parsed = parseRegistrySource(intent.source);
  const settings = asSettings(state.settings);
  const agents = declaredAgents(settings);
  const enabled = readEnabled(settings, intent.name);

  const lockfile = asLockfile(state.lockfile);
  const newSkills: Record<string, RawSkillEntry> = { ...lockfile.skills };
  if (parsed !== undefined) {
    newSkills[intent.name] = {
      type: "registry",
      owner: parsed.owner,
      name: parsed.name,
      resolvedVersion: parsed.versionRange ?? "0.0.0",
      integrity: "sha512-stub",
      sourceName: "default",
      agents: agents.map((a) => a.id),
      installedAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
      sourceHash: "stub-source-hash",
    };
    state.existingPaths.add(registrySkillProbe(parsed.owner, parsed.name));
  } else {
    newSkills[intent.name] = {
      type: "local",
      path: intent.source,
      agents: agents.map((a) => a.id),
      installedAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
      sourceHash: "stub-source-hash",
    };
    state.existingPaths.add(externalSkillProbe(intent.name));
  }
  state.lockfile = { ...lockfile, skills: newSkills };

  if (enabled) {
    for (const agent of agents) {
      const path = artifactPath(agent, intent.name);
      state.existingPaths.add(path);
      pushListing(state, agent.skills.dir, intent.name);
    }
  }
};

export const applyUninstallSkill = (state: WorkspaceState, intent: UninstallSkillIntent): void => {
  const lockfile = asLockfile(state.lockfile);
  const entry = lockfile.skills[intent.name];
  const agents = declaredAgents(asSettings(state.settings));

  const newSkills: Record<string, RawSkillEntry> = { ...lockfile.skills };
  delete newSkills[intent.name];
  state.lockfile = { ...lockfile, skills: newSkills };

  if (entry !== undefined && entry.type === "registry") {
    state.existingPaths.delete(registrySkillProbe(entry.owner, intent.name));
  } else {
    state.existingPaths.delete(externalSkillProbe(intent.name));
  }

  for (const agent of agents) {
    const path = artifactPath(agent, intent.name);
    state.existingPaths.delete(path);
    removeFromListing(state, agent.skills.dir, intent.name);
  }
};

export const applyEnableSkill = (state: WorkspaceState, intent: EnableSkillIntent): void => {
  const agents = declaredAgents(asSettings(state.settings));
  for (const agent of agents) {
    const path = artifactPath(agent, intent.name);
    state.existingPaths.add(path);
    pushListing(state, agent.skills.dir, intent.name);
  }
  setEnabled(state, intent.name, true);
};

export const applyDisableSkill = (state: WorkspaceState, intent: DisableSkillIntent): void => {
  const agents = declaredAgents(asSettings(state.settings));
  for (const agent of agents) {
    const path = artifactPath(agent, intent.name);
    state.existingPaths.delete(path);
    removeFromListing(state, agent.skills.dir, intent.name);
  }
  setEnabled(state, intent.name, false);
};

const setEnabled = (state: WorkspaceState, name: string, enabled: boolean): void => {
  const settings = asSettings(state.settings);
  if (settings?.skills === undefined) {
    return;
  }
  const entry = settings.skills[name];
  if (entry === undefined) {
    return;
  }
  const newEntry =
    typeof entry === "string"
      ? enabled
        ? entry
        : { source: entry, enabled: false }
      : {
          ...(entry as Readonly<Record<string, unknown>>),
          enabled,
        };
  const nextSkills = { ...settings.skills, [name]: newEntry };
  state.settings = { ...settings, skills: nextSkills };
};

export const applyInstallPack = (state: WorkspaceState, intent: InstallPackIntent): void => {
  const parsed = parseRegistrySource(intent.source);
  if (parsed === undefined) {
    return;
  }
  const lockfile = asLockfile(state.lockfile);
  const nextPacks: Record<string, RawPackEntry> = {
    ...(lockfile.packs ?? {}),
    [intent.name]: {
      type: "registry",
      owner: parsed.owner,
      name: parsed.name,
      resolvedVersion: parsed.versionRange ?? "0.0.0",
      integrity: "sha512-stub",
      sourceName: "default",
      installedAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
      resolvedSkills: {},
      resolvedCommands: {},
      resolvedMcpServers: {},
      resolvedSubagents: {},
    },
  };
  state.lockfile = { ...lockfile, packs: nextPacks };
  state.existingPaths.add(registryPackProbe(parsed.owner, parsed.name));
};

export const applyUninstallPack = (state: WorkspaceState, intent: UninstallPackIntent): void => {
  const lockfile = asLockfile(state.lockfile);
  const packs = lockfile.packs ?? {};
  const entry = packs[intent.name];
  const nextPacks = { ...packs };
  delete nextPacks[intent.name];
  state.lockfile = { ...lockfile, packs: nextPacks };
  if (entry !== undefined && entry.type === "registry") {
    state.existingPaths.delete(registryPackProbe(entry.owner, intent.name));
  }
};

// -----------------------------------------------------------------------------
// Bulk dispatcher
// -----------------------------------------------------------------------------

// Narrow-by-predicate helpers — keep the `op.args` cast colocated with
// runtime validation so the rest of the reducer can trust the narrowed
// shape without further assertions.

const isInstallSkillIntent = (args: unknown): args is InstallSkillIntent =>
  typeof args === "object" &&
  args !== null &&
  typeof (args as InstallSkillIntent).name === "string" &&
  typeof (args as InstallSkillIntent).source === "string" &&
  typeof (args as InstallSkillIntent).force === "boolean";

const isUninstallSkillIntent = (args: unknown): args is UninstallSkillIntent =>
  typeof args === "object" &&
  args !== null &&
  typeof (args as UninstallSkillIntent).name === "string";

const isEnableSkillIntent = (args: unknown): args is EnableSkillIntent =>
  isUninstallSkillIntent(args);

const isDisableSkillIntent = (args: unknown): args is DisableSkillIntent =>
  isUninstallSkillIntent(args);

const isInstallPackIntent = (args: unknown): args is InstallPackIntent =>
  isInstallSkillIntent(args);

const isUninstallPackIntent = (args: unknown): args is UninstallPackIntent =>
  isUninstallSkillIntent(args);

export const applyOperationIntent = (
  state: WorkspaceState,
  op: Operation<string, unknown>,
): void => {
  switch (op.name) {
    case "install-skill":
      if (isInstallSkillIntent(op.args)) {
        applyInstallSkill(state, op.args);
      }
      return;
    case "uninstall-skill":
      if (isUninstallSkillIntent(op.args)) {
        applyUninstallSkill(state, op.args);
      }
      return;
    case "enable-skill":
      if (isEnableSkillIntent(op.args)) {
        applyEnableSkill(state, op.args);
      }
      return;
    case "disable-skill":
      if (isDisableSkillIntent(op.args)) {
        applyDisableSkill(state, op.args);
      }
      return;
    case "install-pack":
      if (isInstallPackIntent(op.args)) {
        applyInstallPack(state, op.args);
      }
      return;
    case "uninstall-pack":
      if (isUninstallPackIntent(op.args)) {
        applyUninstallPack(state, op.args);
      }
      return;
    case "install-command":
    case "uninstall-command":
    case "enable-command":
    case "disable-command":
    case "install-mcp-server":
    case "uninstall-mcp-server":
    case "enable-subagent":
    case "disable-subagent":
      return;
    default:
      throw new Error(`applyOperationIntent: unknown operation '${op.name}'`);
  }
};

// -----------------------------------------------------------------------------
// Listing helpers
// -----------------------------------------------------------------------------

const pushListing = (state: WorkspaceState, dir: string, child: string): void => {
  const existing = state.listings.get(dir);
  if (existing === undefined) {
    state.listings.set(dir, [child]);
    return;
  }
  if (!existing.includes(child)) {
    existing.push(child);
  }
};

const removeFromListing = (state: WorkspaceState, dir: string, child: string): void => {
  const existing = state.listings.get(dir);
  if (existing === undefined) {
    return;
  }
  const idx = existing.indexOf(child);
  if (idx !== -1) {
    existing.splice(idx, 1);
  }
};
