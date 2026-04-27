/**
 * Rule subject module: declared/resolved/actual payloads, scanner composition,
 * and projections via the shared helper.
 *
 * Rules have no `settings.json` entry shape and no `axm-lock.yaml` entry
 * shape in v1. Actual occurrences come from the canonical-extensions
 * scanner (`type === "rule"`); the agent-dir scanner emits no rule
 * occurrences in the v1 `AgentRegistry`, but the subject module accepts an
 * agent-dir scanner input so future agents can register rule directories
 * without further changes here.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../../agents/types.js";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { Diagnostics, Warning } from "../diagnostics.js";
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

export type DeclaredRule = never;
export type DeclaredRules = ReadonlyArray<DeclaredRule>;

export type ResolvedRule = never;
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

export type IgnoredRuleCandidate = {
  readonly key: ExtensionKey<"rule">;
  readonly reason: "actual-ignored";
  readonly actual: ActualRule;
};

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

export interface InstalledPackForRules {
  readonly ref: InstalledPackRef;
  readonly rules: ReadonlyArray<RulePackMember>;
}

export interface RuleExtensionsApiDeps {
  readonly scope: Scope;
  readonly scanners: RuleScanners;
  readonly installedPacks: Effect.Effect<ReadonlyArray<InstalledPackForRules>>;
  readonly ignoredNames: ReadonlySet<string>;
  readonly diagnostics: Diagnostics;
}

export interface RuleExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredRules>>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedRules>>;
  readonly actual: Effect.Effect<ActualRules>;
  readonly installed: Effect.Effect<ReadonlyArray<InstalledRule>>;
  readonly byName: (name: string) => Effect.Effect<Option.Option<InstalledRule>>;
  readonly declaredByName: (name: string) => Effect.Effect<Option.Option<DeclaredRule>>;
  readonly active: Effect.Effect<ReadonlyArray<InstalledRule>>;
  readonly unmanaged: Effect.Effect<ReadonlyArray<UnmanagedRule>>;
  readonly ignored: Effect.Effect<ReadonlyArray<IgnoredRuleCandidate>>;
}

const SUBJECT_KEY = "rule";

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
  // `never` rather than `RulePackMember`: v1 emits no rule pack members, so
  // the projection helper never invokes pack-member callbacks. The narrower
  // `never` lets `buildPackMemberIgnoredRow` be implemented without a throw.
  never,
  InstalledRule,
  UnmanagedRule,
  IgnoredRuleCandidate
> => ({
  declaredEntries: () => [],
  declaredName: (entry) => entry,
  declaredActivation: () => "enabled",
  resolvedEntries: () => [],
  resolvedName: (entry) => entry,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  // `m: never` — the helper invocation passes `TPackMember = never`, so
  // this callback is statically uninhabitable. Returning `m` (typed as
  // `never`) satisfies the `string` return type.
  packMemberName: (m) => m,
  isIgnoredName: (name, ignored) => ignored.has(name),
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "rule", name: decodeExtensionNameSync(input.name) },
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
  // `DeclaredRule = never` (rules have no settings entry shape), so
  // `input.declared` has type `never` and `return input.declared` satisfies
  // any `TIgnored` statically. The body is uninhabitable at runtime.
  buildDeclaredIgnoredRow: (input) => input.declared,
  // The helper invocation passes `TPackMember = never` (v1 emits no rule
  // pack members), so `input.member` has type `never` and the body is
  // uninhabitable at runtime — no throw needed.
  buildPackMemberIgnoredRow: (input) => input.member,
  buildActualIgnoredRow: (input) => ({
    key: { scope, type: "rule", name: decodeExtensionNameSync(input.name) },
    reason: "actual-ignored",
    actual: input.actual,
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
    const { scope, scanners, ignoredNames, diagnostics } = deps;

    const declared: RuleExtensionsApi["declared"] = Effect.succeed(Option.none<DeclaredRules>());
    const resolved: RuleExtensionsApi["resolved"] = Effect.succeed(Option.none<ResolvedRules>());
    const actual: RuleExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      return filterMapOccurrences(canonical, "rule", (occ) => canonicalToActual(occ, scope));
    });

    // v1 emits no rule pack members. Pass an empty installed-packs effect to
    // the projection helper with `TPackMember = never` so unreachable
    // pack-member callbacks become statically uninhabitable.
    // `deps.installedPacks` is accepted on the public dep contract but ignored
    // here until v2 wires rule pack members through.
    const installedPacksForHelper: Effect.Effect<
      ReadonlyArray<{ readonly ref: InstalledPackRef; readonly members: ReadonlyArray<never> }>
    > = Effect.succeed([]);

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        subjectKey: SUBJECT_KEY,
        declared,
        resolved,
        actual,
        installedPacks: installedPacksForHelper,
        packMembers: (pack) => pack.members,
        packRef: (pack) => pack.ref,
        ignoredNames,
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
      declaredByName: () => Effect.succeed(Option.none()),
    } satisfies RuleExtensionsApi;
  });
