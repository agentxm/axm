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
 * - Some MCP agent-config operations are stubs for the harness; today no
 *   seeded reducer state models those files.
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
import { parseRegistrySourceRef } from "../../../extensions/registry-source.js";

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
  readonly publisherBindingId: string;
  readonly agents: ReadonlyArray<string>;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly sourceHash?: string;
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
  readonly publisherBindingId: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly resolvedSkills: Record<string, RawResolvedRegistryExtension>;
  readonly resolvedMcpServers: Record<string, RawResolvedRegistryExtension>;
  readonly resolvedSubagents: Record<string, RawResolvedRegistryExtension>;
}

interface RawResolvedRegistryExtension {
  readonly source: "registry";
  readonly version: string;
  readonly publisherBindingId: string;
  readonly integrity: string;
}

interface RawLockfile {
  readonly lockfileVersion: number;
  skills: Record<string, RawSkillEntry>;
  subagents?: Record<string, unknown>;
  mcpServers?: Record<string, unknown>;
  rules?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  knowledge?: Record<string, unknown>;
  packs?: Record<string, RawPackEntry>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asLockfile = (doc: unknown): RawLockfile => {
  if (!isRecord(doc) || !("lockfileVersion" in doc)) {
    return { lockfileVersion: 3, skills: {} };
  }
  const version = doc["lockfileVersion"];
  const skills = doc["skills"];
  const subagents = doc["subagents"];
  const mcpServers = doc["mcpServers"];
  const rules = doc["rules"];
  const hooks = doc["hooks"];
  const knowledge = doc["knowledge"];
  const packs = doc["packs"];
  const result: RawLockfile = {
    lockfileVersion: typeof version === "number" ? version : 1,
    skills: isRecord(skills) ? { ...(skills as Record<string, RawSkillEntry>) } : {},
    ...(isRecord(subagents) ? { subagents: { ...subagents } } : {}),
    ...(isRecord(mcpServers) ? { mcpServers: { ...mcpServers } } : {}),
    ...(isRecord(rules) ? { rules: { ...rules } } : {}),
    ...(isRecord(hooks) ? { hooks: { ...hooks } } : {}),
    ...(isRecord(knowledge) ? { knowledge: { ...knowledge } } : {}),
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

const universalSkillPath = (skillName: string): string => `.agents/skills/${skillName}`;

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
  const parsed = parseRegistrySourceRef(intent.source);
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
      publisherBindingId: "hbnd_test",
      agents: ["universal", ...agents.map((a) => a.id)],
      installedAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
      sourceHash: "stub-source-hash",
    };
    state.existingPaths.add(registrySkillProbe(parsed.owner, parsed.name));
  } else {
    newSkills[intent.name] = {
      type: "local",
      path: intent.source,
      agents: ["universal", ...agents.map((a) => a.id)],
      installedAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
      sourceHash: "stub-source-hash",
    };
    state.existingPaths.add(externalSkillProbe(intent.name));
  }
  state.lockfile = { ...lockfile, skills: newSkills };

  if (enabled) {
    state.existingPaths.add(universalSkillPath(intent.name));
    pushListing(state, ".agents/skills", intent.name);
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
  state.existingPaths.delete(universalSkillPath(intent.name));
  removeFromListing(state, ".agents/skills", intent.name);
};

export const applyEnableSkill = (state: WorkspaceState, intent: EnableSkillIntent): void => {
  const lockfile = asLockfile(state.lockfile);
  const entry = lockfile.skills[intent.name];
  if (entry !== undefined) {
    state.lockfile = {
      ...lockfile,
      skills: {
        ...lockfile.skills,
        [intent.name]: {
          ...entry,
          agents: entry.agents.includes("universal")
            ? entry.agents
            : ["universal", ...entry.agents],
        },
      },
    };
  }
  state.existingPaths.add(universalSkillPath(intent.name));
  pushListing(state, ".agents/skills", intent.name);

  const agents = declaredAgents(asSettings(state.settings));
  for (const agent of agents) {
    const path = artifactPath(agent, intent.name);
    state.existingPaths.add(path);
    pushListing(state, agent.skills.dir, intent.name);
  }
  setEnabled(state, intent.name, true);
};

export const applyDisableSkill = (state: WorkspaceState, intent: DisableSkillIntent): void => {
  const lockfile = asLockfile(state.lockfile);
  const entry = lockfile.skills[intent.name];
  if (entry !== undefined) {
    state.lockfile = {
      ...lockfile,
      skills: {
        ...lockfile.skills,
        [intent.name]: { ...entry, agents: [] },
      },
    };
  }
  state.existingPaths.delete(universalSkillPath(intent.name));
  removeFromListing(state, ".agents/skills", intent.name);

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
  const parsed = parseRegistrySourceRef(intent.source);
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
      publisherBindingId: "hbnd_test",
      installedAt: FIXED_NOW_ISO,
      updatedAt: FIXED_NOW_ISO,
      resolvedSkills: {},
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

// -----------------------------------------------------------------------------
// Package-family reducers
// -----------------------------------------------------------------------------

/**
 * Lockfile map key and canonical manifest filename for each family whose
 * install/uninstall the harness models as "lock entry plus a canonical
 * package probe".
 *
 * Per-agent artifact materialization is deliberately not modeled here: no
 * autofixing rule emits per-agent artifact ops for these families yet, and a
 * fake artifact tree would make convergence tests pass for the wrong reason.
 * When such a rule lands, its family gains an artifact arm alongside the skill
 * one.
 */
const PACKAGE_FAMILIES = {
  "install-subagent": { key: "subagents", plural: "subagents", manifest: "subagent.json" },
  "uninstall-subagent": { key: "subagents", plural: "subagents", manifest: "subagent.json" },
  "install-mcp-server": { key: "mcpServers", plural: "mcps", manifest: "mcp.json" },
  "uninstall-mcp-server": { key: "mcpServers", plural: "mcps", manifest: "mcp.json" },
  "install-rule": { key: "rules", plural: "rules", manifest: "rule.json" },
  "uninstall-rule": { key: "rules", plural: "rules", manifest: "rule.json" },
  "install-hook": { key: "hooks", plural: "hooks", manifest: "hook.json" },
  "uninstall-hook": { key: "hooks", plural: "hooks", manifest: "hook.json" },
  "install-knowledge": { key: "knowledge", plural: "knowledge", manifest: "knowledge.json" },
  "uninstall-knowledge": { key: "knowledge", plural: "knowledge", manifest: "knowledge.json" },
} as const;

type PackageFamilyOpName = keyof typeof PACKAGE_FAMILIES;
type PackageFamily = (typeof PACKAGE_FAMILIES)[PackageFamilyOpName];

const isPackageFamilyOpName = (name: string): name is PackageFamilyOpName =>
  name in PACKAGE_FAMILIES;

const packageProbe = (family: PackageFamily, owner: string, name: string): string =>
  `.axm/extensions/${owner}/${family.plural}/${name}/${family.manifest}`;

const familyMap = (lockfile: RawLockfile, key: string): Record<string, unknown> => {
  const existing = lockfile[key as keyof RawLockfile];
  return isRecord(existing) ? { ...existing } : {};
};

const applyInstallPackage = (
  state: WorkspaceState,
  family: PackageFamily,
  intent: { readonly name: string; readonly source: string },
): void => {
  const parsed = parseRegistrySourceRef(intent.source);
  const lockfile = asLockfile(state.lockfile);
  const entries = familyMap(lockfile, family.key);
  const owner = parsed?.owner ?? "external";
  entries[intent.name] =
    parsed === undefined
      ? {
          type: "local",
          path: intent.source,
          installedAt: FIXED_NOW_ISO,
          updatedAt: FIXED_NOW_ISO,
          sourceHash: "stub-source-hash",
        }
      : {
          type: "registry",
          owner: parsed.owner,
          name: parsed.name,
          resolvedVersion: parsed.versionRange ?? "0.0.0",
          integrity: "sha512-stub",
          sourceName: "default",
          publisherBindingId: "hbnd_test",
          installedAt: FIXED_NOW_ISO,
          updatedAt: FIXED_NOW_ISO,
          sourceHash: "stub-source-hash",
        };
  state.lockfile = { ...lockfile, [family.key]: entries };
  state.existingPaths.add(packageProbe(family, owner, intent.name));
};

const applyUninstallPackage = (
  state: WorkspaceState,
  family: PackageFamily,
  intent: { readonly name: string },
): void => {
  const lockfile = asLockfile(state.lockfile);
  const entries = familyMap(lockfile, family.key);
  const entry = entries[intent.name];
  delete entries[intent.name];
  state.lockfile = { ...lockfile, [family.key]: entries };
  const owner = isRecord(entry) && typeof entry["owner"] === "string" ? entry["owner"] : "external";
  state.existingPaths.delete(packageProbe(family, owner, intent.name));
};

/**
 * Activation for a family whose only observable state is the settings entry's
 * `enabled` flag. Skills additionally materialize agent-dir artifacts; these
 * families do not.
 */
const ACTIVATION_FAMILIES = {
  "enable-subagent": { key: "subagents", enabled: true },
  "disable-subagent": { key: "subagents", enabled: false },
  "enable-rule": { key: "rules", enabled: true },
  "disable-rule": { key: "rules", enabled: false },
  "enable-hook": { key: "hooks", enabled: true },
  "disable-hook": { key: "hooks", enabled: false },
  "enable-knowledge": { key: "knowledge", enabled: true },
  "disable-knowledge": { key: "knowledge", enabled: false },
} as const;

type ActivationOpName = keyof typeof ACTIVATION_FAMILIES;

const isActivationOpName = (name: string): name is ActivationOpName => name in ACTIVATION_FAMILIES;

const applyActivation = (
  state: WorkspaceState,
  spec: (typeof ACTIVATION_FAMILIES)[ActivationOpName],
  intent: { readonly name: string },
): void => {
  const settings = asSettings(state.settings);
  if (settings === undefined) {
    return;
  }
  const map = settings[spec.key as keyof RawSettings];
  if (!isRecord(map)) {
    return;
  }
  const existing = map[intent.name];
  const nextEntry = isRecord(existing)
    ? { ...existing, enabled: spec.enabled }
    : { source: typeof existing === "string" ? existing : "", enabled: spec.enabled };
  state.settings = {
    ...settings,
    [spec.key]: { ...map, [intent.name]: nextEntry },
  };
};

const hasName = (args: unknown): args is { readonly name: string } =>
  isRecord(args) && typeof args["name"] === "string";

const hasNameAndSource = (
  args: unknown,
): args is { readonly name: string; readonly source: string } =>
  hasName(args) && typeof (args as { source?: unknown }).source === "string";

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
    case "sync-mcp-server-agent":
    case "remove-mcp-server-agent":
    case "sync-instruction-target":
    case "sync-instructions-gitignore":
      // A fixture that exercises an autofix must observe its effect; silently
      // ignoring the op would report the fix as converged without applying it.
      // These names are part of the canonical vocabulary, so they are reported
      // as unimplemented rather than unknown — `default` stays reserved for a
      // name no rule is allowed to emit.
      throw new Error(
        `applyOperationIntent: operation '${op.name}' has no fixture interpreter arm yet`,
      );
    default:
      if (isPackageFamilyOpName(op.name)) {
        const family = PACKAGE_FAMILIES[op.name];
        if (op.name.startsWith("install-")) {
          if (hasNameAndSource(op.args)) {
            applyInstallPackage(state, family, op.args);
          }
          return;
        }
        if (hasName(op.args)) {
          applyUninstallPackage(state, family, op.args);
        }
        return;
      }
      if (isActivationOpName(op.name)) {
        if (hasName(op.args)) {
          applyActivation(state, ACTIVATION_FAMILIES[op.name], op.args);
        }
        return;
      }
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
