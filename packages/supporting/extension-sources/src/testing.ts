/**
 * @agentxm/extension-sources deterministic test ports.
 *
 * The four seams this integration declares but does not implement — the
 * workspace catalog it reads facts from, the official-skill gate, the
 * registry resolution policy, and the Git worktree comparison publication
 * preflight consults — plus an inert provider set for runs that must be shown
 * never to fetch a source. Each carries workspace facts as data, so a test
 * states the facts it depends on instead of building a workspace to imply
 * them. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as semver from "semver";

import type { RegistrySourceHost } from "@agentxm/extension-model/unstable/sources/types";
import { resolveVersionEntry } from "@agentxm/registry-protocol/unstable/registry/version-selection";

import { AxmSkillCandidateGate, type AxmSkillCandidateGateService } from "./axm-skill-gate.js";
import { SourceNotResolvable } from "./errors.js";
import {
  GitDirectoryComparison,
  type GitDirectoryComparisonService,
} from "./git/directory-comparison.js";
import { RegistryResolutionPolicy } from "./registry-resolution-policy.js";
import { SourceHostProviders, type SourceHostProvidersService } from "./service.js";
import {
  WorkspaceCatalog,
  type ConfiguredSourceHost,
  type DesiredExtensionGraphView,
  type SkillCandidates,
} from "./workspace-catalog.js";

export interface WorkspaceCatalogTestOptions {
  readonly workspaceRoot?: string;
  readonly sources?: ReadonlyArray<ConfiguredSourceHost>;
  readonly registrySources?: ReadonlyArray<RegistrySourceHost>;
  readonly desiredExtensionGraph?: DesiredExtensionGraphView;
  readonly skillCandidates?: SkillCandidates;
}

/**
 * The workspace facts source resolution reads, stated directly.
 *
 * `registrySources` defaults to the registry-typed entries of `sources`, so a
 * test that names its configured sources once does not restate them.
 */
export const WorkspaceCatalogTest = (
  options: WorkspaceCatalogTestOptions = {},
): Layer.Layer<WorkspaceCatalog> => {
  const sources = options.sources ?? [];
  const registrySources =
    options.registrySources ??
    sources.filter((source): source is RegistrySourceHost => source.type === "registry");
  return Layer.succeed(WorkspaceCatalog, {
    workspaceRoot: options.workspaceRoot ?? "/tmp/axm",
    configuredSources: Effect.succeed(sources),
    registrySourceHosts: Effect.succeed(registrySources),
    desiredExtensionGraph: Effect.succeed(
      options.desiredExtensionGraph ?? { complete: true, nodes: [] },
    ),
    skillCandidates: Effect.succeed(
      options.skillCandidates ?? {
        names: [],
        configuredSkills: {},
        onDiskByName: new Map<string, string>(),
      },
    ),
  });
};

/**
 * The official-skill gate. The default reports every candidate as not the
 * official AXM skill; a test exercising the gate supplies its own evaluation.
 */
export const AxmSkillCandidateGateTest = (
  evaluate?: AxmSkillCandidateGateService["evaluate"],
): Layer.Layer<AxmSkillCandidateGate> =>
  Layer.succeed(AxmSkillCandidateGate, {
    evaluate: evaluate ?? (() => Effect.succeed(null)),
  });

/**
 * The Registry's own selection rule with no release-age policy applied: every
 * matching version is a selectable candidate, newest first; nothing is
 * withheld and nothing is exempted. A test that needs the age gate composes
 * the real policy from `@agentxm/extension-resolution` instead.
 */
export const RegistryResolutionPolicyTest: Layer.Layer<RegistryResolutionPolicy> = Layer.succeed(
  RegistryResolutionPolicy,
  {
    selectVersion: (versions, versionRange) =>
      Effect.succeed(resolveVersionEntry(versions, versionRange)),
    decideNamedVersion: (index, options) => {
      const selected = resolveVersionEntry(index.versions, options.versionRange);
      if (Option.isSome(selected)) {
        return { kind: "selected", version: selected.value.version };
      }
      const requested = Option.getOrElse(options.versionRange, () => "*");
      return semver.valid(requested) === requested
        ? { kind: "not_found" }
        : { kind: "version_unsatisfied", requestedRange: requested };
    },
    namedCandidates: (index, options) => {
      const requested = Option.getOrElse(options.versionRange, () => "*");
      const exact = semver.valid(requested) === requested;
      return index.versions
        .filter((entry) =>
          exact
            ? entry.version === requested
            : entry.yankedAt === undefined && semver.satisfies(entry.version, requested),
        )
        .sort((left, right) => semver.compareBuild(right.version, left.version))
        .map((entry) => ({ version: entry.version, outcome: { kind: "selected" } }));
    },
  },
);

/**
 * The Git worktree comparison publication preflight consults. The default
 * reports no enclosing worktree, which is the honest answer for a fixture
 * directory outside any repository; pass `compare` to model a dirty or
 * diverged source.
 */
export const GitDirectoryComparisonTest = (
  compare: GitDirectoryComparisonService["compare"] = () => Effect.succeed(Option.none()),
): Layer.Layer<GitDirectoryComparison> => Layer.succeed(GitDirectoryComparison, { compare });

/**
 * A provider set that resolves nothing and fetches nothing, failing with the
 * integration's own typed refusal. Compose it when the run under test must be
 * shown to decide before it reaches a source; override one member to let a
 * single lookup through.
 */
export const SourceHostProvidersTest = (
  overrides: Partial<SourceHostProvidersService> = {},
): Layer.Layer<SourceHostProviders> =>
  Layer.succeed(SourceHostProviders, {
    find: () => Effect.succeed([]),
    resolveNamedRegistry: () =>
      Effect.fail(
        new SourceNotResolvable({
          category: "not_found",
          detail: "The test provider set resolves no named Registry.",
        }),
      ),
    fetch: () =>
      Effect.fail(
        new SourceNotResolvable({
          category: "not_found",
          detail: "The test provider set fetches no source.",
        }),
      ),
    cloneUrl: () => Option.none(),
    origin: (source) => source.type,
    ...overrides,
  });
