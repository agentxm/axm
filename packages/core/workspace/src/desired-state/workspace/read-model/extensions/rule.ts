/**
 * Rule subject module: declared/resolved/actual payloads, scanner composition,
 * and projections via the shared helper.
 *
 * Rules have no `axm.json` entry shape and no `axm-lock.yaml` entry
 * shape in v1. Actual occurrences come from the canonical-extensions
 * scanner (`type === "rule"`); the agent-dir scanner emits no rule
 * occurrences in the v1 `AgentRegistry`, but the subject module accepts an
 * agent-dir scanner input so future agents can register rule directories
 * without further changes here.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { Lockfile, RuleLockEntry } from "../../../lockfile/schema.js";
import type { RuleEntry, Settings } from "../../../settings/schema.js";
import type { Diagnostics, Warning } from "../diagnostics.js";
import type { LockfileReadError, SettingsReadError } from "../errors.js";
import type { CanonicalExtensionOccurrence } from "../scanners/types.js";
import type {
  ActivationState,
  ExtensionKey,
  InstallationOrigin,
  InstalledPackRef,
  Scope,
} from "../types.js";
import { filterMapOccurrences } from "./actual-helpers.js";
import { canonicalAxmPackageRoot } from "./package-root.js";
import {
  makeProjectedSubjectCells,
  projectInstalledExtensions,
  type SubjectPolicy,
} from "./projection.js";

// ---------------------------------------------------------------------------
// Detection origin
// ---------------------------------------------------------------------------

export type RuleDetectionOrigin =
  | { readonly _tag: "canonical-axm-rule" }
  | { readonly _tag: "external-axm-rule" }
  | { readonly _tag: "agent-rule-dir"; readonly agentId: AgentId };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredRule {
  readonly name: ExtensionName;
  readonly entry: RuleEntry;
}
export type DeclaredRules = ReadonlyArray<DeclaredRule>;

export interface ResolvedRule {
  readonly name: ExtensionName;
  readonly lockEntry: RuleLockEntry;
}
export type ResolvedRules = ReadonlyArray<ResolvedRule>;

export interface ActualRule {
  readonly key: ExtensionKey<"rule">;
  readonly origin: RuleDetectionOrigin;
  readonly contentRoot: string;
  readonly packageRoot: string | null;
}
export type ActualRules = ReadonlyArray<ActualRule>;

export interface RulePackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledRule {
  readonly key: ExtensionKey<"rule">;
  readonly installationOrigin: InstallationOrigin<DeclaredRule, RulePackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedRule>;
  readonly actual: ReadonlyArray<ActualRule>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedRule {
  readonly key: ExtensionKey<"rule">;
  readonly actual: ActualRule;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualRule => {
  const isExternal = occ.origin === "external-axm";
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "rule", name: occ.name },
    origin: isExternal ? { _tag: "external-axm-rule" } : { _tag: "canonical-axm-rule" },
    contentRoot: occ.contentLocation,
    packageRoot,
  };
};

const declaredFromSettings = (settings: Settings): DeclaredRules => {
  if (settings.rules === undefined) return [];
  return Object.entries(settings.rules).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedRules => {
  if (lockfile.rules === undefined) return [];
  return Object.entries(lockfile.rules).map(([name, lockEntry]) => ({
    name: decodeExtensionNameSync(name),
    lockEntry,
  }));
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rule scanners. v1 ships a canonical scanner only; the v1 `AgentRegistry`
 * does not register rule directories, so there is no agent-dir rule input.
 * If a future agent registers a rule directory, this scanner record gains an
 * `agentDir` field and the subject module wires through `agent-rule-dir`
 * origins.
 */
export interface RuleScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

export interface RuleScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface InstalledPackForRules {
  readonly ref: InstalledPackRef;
  readonly rules: ReadonlyArray<RulePackMember>;
}

export interface RuleExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: RuleScopedLoaders;
  readonly scanners: RuleScanners;
  readonly installedPacks: Effect.Effect<
    ReadonlyArray<InstalledPackForRules>,
    SettingsReadError | LockfileReadError
  >;
  readonly diagnostics: Diagnostics;
}

export interface RuleExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredRules>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedRules>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualRules>;
  readonly installed: Effect.Effect<
    ReadonlyArray<InstalledRule>,
    SettingsReadError | LockfileReadError
  >;
  readonly byName: (
    name: string,
  ) => Effect.Effect<Option.Option<InstalledRule>, SettingsReadError | LockfileReadError>;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredRule>, SettingsReadError>;
  readonly active: Effect.Effect<
    ReadonlyArray<InstalledRule>,
    SettingsReadError | LockfileReadError
  >;
  readonly unmanaged: Effect.Effect<
    ReadonlyArray<UnmanagedRule>,
    SettingsReadError | LockfileReadError
  >;
}

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `rule: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const rulePolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredRules,
  ResolvedRules,
  ActualRules,
  RulePackMember,
  InstalledRule,
  UnmanagedRule
> => ({
  declaredEntries: (d) => d,
  declaredName: (entry) => entry.name,
  declaredActivation: (entry) => (entry.entry.enabled === false ? "disabled" : "enabled"),
  resolvedEntries: (r) => r,
  resolvedName: (entry) => entry.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  packMemberName: (m) => m.name,
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "rule", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "rule", name: entry.key.name },
    actual: entry,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the rule subject API. Returns an `Effect` because the projection
 * cell is wrapped in `Effect.cached` so the four derived cells share one
 * in-flight execution per scope, mirroring `state.ts`.
 */
export const makeRuleExtensionsApi = (
  deps: RuleExtensionsApiDeps,
): Effect.Effect<RuleExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, scanners, diagnostics } = deps;

    const declared: RuleExtensionsApi["declared"] = deps.loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: RuleExtensionsApi["resolved"] = deps.loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, resolvedFromLockfile)),
    );
    const actual: RuleExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "rule", (occ) => canonicalToActual(occ, scope));
    });

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        declared,
        resolved,
        actual,
        installedPacks: deps.installedPacks,
        packMembers: (pack: {
          readonly rules: ReadonlyArray<RulePackMember>;
        }): ReadonlyArray<RulePackMember> => pack.rules,
        packRef: (pack) => pack.ref,
        policy: rulePolicy(scope),
        diagnostics,
      }),
    );

    return {
      ...makeProjectedSubjectCells({
        declared,
        resolved,
        actual,
        project,
      }),
      declared,
      resolved,
      actual,
    } satisfies RuleExtensionsApi;
  });
