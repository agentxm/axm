/**
 * Package-local decode and assertion helpers for the internal test suite.
 *
 * Deliberately duplicated from the CLI-destined test-support module: this
 * package's tests may not reach into the application package, and these
 * helpers are within the sanctioned duplication budget for small pure
 * functions.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import {
  ExtensionDependencyConstraintMapSchema,
  decodeExtensionNameSync,
  parseSourceQualifiedRegistrySourcePatternParts,
  type ExtensionDependencyConstraintMap,
  type ExtensionName,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { RegistrySourceHost } from "@agentxm/extension-model/unstable/sources/types";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { AxmSkillCandidateGate, type AxmSkillCandidateGateService } from "./axm-skill-gate.js";
import {
  WorkspaceCatalog,
  type ConfiguredSourceHost,
  type DesiredExtensionGraphView,
  type DesiredExtensionNodeView,
  type SkillCandidates,
} from "./workspace-catalog.js";

export const expectDefined = <T>(value: T | undefined, message = "Expected defined value"): T => {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
};

export const at = <T>(values: ReadonlyArray<T>, index: number, message?: string): T =>
  expectDefined(values[index], message ?? `Expected value at index ${index}`);

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

export const dependencyConstraints = (
  value: Record<string, string>,
): ExtensionDependencyConstraintMap =>
  Schema.decodeUnknownSync(ExtensionDependencyConstraintMapSchema)(value);

/**
 * One desired-graph node as the workspace layer synthesizes it from a
 * configured entry: the identity is the source-qualified registry pattern's
 * FQN when the source parses as one, otherwise the raw source string.
 */
export const desiredNode = (
  type: ExtensionType,
  name: string,
  source: string,
): DesiredExtensionNodeView => {
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(source);
  return {
    type,
    name,
    identity: parsed === undefined ? source : `${parsed.owner}/${parsed.type}/${parsed.name}`,
    source,
  };
};

export interface TestWorkspaceCatalogOptions {
  readonly workspaceRoot?: string;
  readonly sources?: ReadonlyArray<ConfiguredSourceHost>;
  readonly registrySources?: ReadonlyArray<RegistrySourceHost>;
  readonly desiredExtensionGraph?: DesiredExtensionGraphView;
  readonly skillCandidates?: SkillCandidates;
}

/**
 * A deterministic official AXM skill gate for tests. The default gate reports
 * every candidate as not the official skill; tests exercising the gate pass
 * their own evaluation.
 */
export const makeTestAxmSkillGate = (evaluate?: AxmSkillCandidateGateService["evaluate"]) =>
  Layer.succeed(AxmSkillCandidateGate, {
    evaluate: evaluate ?? (() => Effect.succeed(null)),
  });

/**
 * A deterministic `WorkspaceCatalog` for tests: the catalog is a port that
 * carries workspace facts as data, so tests state those facts directly.
 */
export const makeTestWorkspaceCatalog = (options: TestWorkspaceCatalogOptions = {}) => {
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
