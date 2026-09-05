/**
 * Shared helpers for extension-lifecycle internal tests: decode shortcuts,
 * deterministic tree integrity, a coding-agent stub, a structural failure
 * adapter, and a workspace-backed catalog layer for configured-entry
 * resolution against temporary workspaces.
 */

import * as crypto from "node:crypto";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { CodingAgent } from "@agentxm/extension-workspace";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
  type Version,
  type VersionRange,
} from "@agentxm/extension-model/unstable/version-constraints";
import { CodingAgentRepository } from "@agentxm/extension-workspace";
import {
  fileUrlToPath,
  WorkspaceCatalog,
  WorkspaceCatalogUnavailable,
  type SkillCandidates,
} from "@agentxm/extension-sources";
import { StepFailure } from "@agentxm/workspace-operations";
import { skillsInDir, type DiscoveredSkill } from "@agentxm/workspace-state";
import {
  configuredRowsByName,
  installedRowsByName,
  unmanagedRowsByName,
} from "@agentxm/workspace-state";
import { TreeIntegritySchema, type TreeIntegrity } from "@agentxm/workspace-state";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { ExtensionLifecycleFailed } from "./errors.js";
import { LifecycleFailureAdapter } from "./failure-adapter.js";

export const handle = (value: string): Handle => decodeHandleSync(value);

export const extensionName = (value: string): ExtensionName => decodeExtensionNameSync(value);

export const exactVersion = (value: string): Version => decodeVersionSync(value);

export const versionRange = (value: string): VersionRange => decodeVersionRangeSync(value);

export const expectDefined = <T>(value: T | undefined, message = "Expected a defined value"): T => {
  if (value === undefined) throw new Error(message);
  return value;
};

export const at = <T>(values: ReadonlyArray<T>, index: number, message?: string): T =>
  expectDefined(values[index], message ?? `Expected value at index ${index}`);

export const expectRecord = (
  value: unknown,
  message = "Expected object record",
): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return Object.fromEntries(Object.entries(value));
};

export const computeMaterializedTreeIntegritySync = (root: string): TreeIntegrity => {
  const files: globalThis.Array<{ readonly relativePath: string; readonly absolutePath: string }> =
    [];
  const walk = (directory: string, relativeDirectory: string): void => {
    const entries = nodeFs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath =
        relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const absolutePath = nodePath.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Unexpected symlink in test package: ${relativePath}`);
      if (entry.isDirectory()) walk(absolutePath, relativePath);
      else if (entry.isFile()) files.push({ relativePath, absolutePath });
      else throw new Error(`Unexpected filesystem entry in test package: ${relativePath}`);
    }
  };
  walk(root, "");

  const hash = crypto.createHash("sha256");
  const frame = (bytes: Uint8Array): void => {
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.byteLength));
    hash.update(length);
    hash.update(bytes);
  };
  frame(Buffer.from("agentxm-materialized-tree"));
  frame(Buffer.from("1"));
  for (const file of files) {
    frame(Buffer.from(file.relativePath, "utf8"));
    frame(nodeFs.readFileSync(file.absolutePath));
  }
  return Schema.decodeUnknownSync(TreeIntegritySchema)(`sha256-tree-v1:${hash.digest("hex")}`);
};

export const makeCodingAgentStub = (
  id: AgentId,
  overrides?: Partial<CodingAgent>,
): CodingAgent => ({
  id,
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.succeed({ _tag: "supported", dir: `${workspaceRoot}/.${id}/skills` }),
  addMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  removeMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  resolveEffectiveSubagentsDir: ({ workspaceRoot }) =>
    Effect.succeed({
      _tag: "supported",
      dir: `${workspaceRoot}/.${id}/agents`,
      warnings: [],
    }),
  addSubagent: ({ workspaceRoot, input }) =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [`${workspaceRoot}/.${id}/agents/${input.name}.md`],
      warnings: [],
    }),
  removeSubagent: () =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [],
      warnings: [],
    }),
  ...overrides,
});

/** Render a failure as the sentence the structural test adapter reports. */
export const describeTestFailure = (failure: unknown): string => {
  if (failure instanceof ExtensionLifecycleFailed) return failure.detail ?? failure.category;
  if (typeof failure === "object" && failure !== null) {
    for (const key of ["detail", "subject", "message"] as const) {
      if (key in failure) {
        const candidate = Reflect.get(failure, key);
        if (typeof candidate === "string" && candidate.length > 0) return candidate;
      }
    }
    if ("cause" in failure && failure.cause !== undefined && failure.cause !== failure) {
      return describeTestFailure(failure.cause);
    }
  }
  return String(failure);
};

/**
 * Structural stand-in for the application's failure adapter: the feature's
 * own failure maps 1:1; anything else keeps its detail sentence under an
 * `internal` category. Assertions in this package bind to this mapping, not
 * to the application boundary's wording.
 */
export const testFailureToStepFailure = (failure: unknown): StepFailure =>
  failure instanceof ExtensionLifecycleFailed
    ? new StepFailure({
        category: failure.category,
        detail: failure.detail ?? failure.category,
        ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
        ...(failure.cause === undefined ? {} : { cause: failure.cause }),
      })
    : new StepFailure({
        category: "internal",
        detail: describeTestFailure(failure),
        cause: failure,
      });

export const TestLifecycleFailureAdapter = Layer.succeed(LifecycleFailureAdapter, {
  toStepFailure: testFailureToStepFailure,
  describeFailure: describeTestFailure,
  describeFailureMessage: describeTestFailure,
});

const sortNames = (names: ReadonlyArray<string>): ReadonlyArray<string> => {
  const copy = [...names];
  copy.sort((a, b) => a.localeCompare(b));
  return copy;
};

const catalogUnavailable = (failure: unknown): WorkspaceCatalogUnavailable =>
  new WorkspaceCatalogUnavailable({
    category: "internal",
    detail: describeTestFailure(failure),
    cause: failure,
  });

/**
 * Workspace-backed catalog layer for tests: the same facts the application's
 * catalog Live supplies, with structural failure wording.
 */
export const WorkspaceCatalogTestLive = Layer.effect(
  WorkspaceCatalog,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;

    const skillCandidates: Effect.Effect<SkillCandidates, WorkspaceCatalogUnavailable> = Effect.gen(
      function* () {
        const base = ws.baseDir;
        const installedSkills = yield* ws.records
          .rows("skill")
          .pipe(Effect.mapError(catalogUnavailable))
          .pipe(Effect.map(installedRowsByName));
        const unmanagedSkills = yield* ws.records
          .rows("skill")
          .pipe(Effect.mapError(catalogUnavailable))
          .pipe(Effect.map(unmanagedRowsByName));
        const configuredSkills = yield* ws.records
          .rows("skill")
          .pipe(Effect.mapError(catalogUnavailable))
          .pipe(Effect.map(configuredRowsByName));
        const configuredAgents = yield* agentRepo
          .getMaterializationAgents()
          .pipe(Effect.mapError(catalogUnavailable), Effect.provideService(WorkspaceMutations, ws));
        const resolvedAgents = yield* Effect.forEach(
          configuredAgents,
          (agent) =>
            agent.resolveEffectiveSkillsDir({ workspaceRoot: base }).pipe(
              Effect.mapError(catalogUnavailable),
              Effect.map((outcome) => ({ agent, outcome })),
            ),
          { concurrency: "unbounded" },
        );

        const agentRoots = sortNames(
          Array.dedupe(
            Array.getSomes(
              Array.map(resolvedAgents, ({ outcome }) =>
                outcome._tag === "supported"
                  ? Option.some(path.normalize(outcome.dir))
                  : Option.none<string>(),
              ),
            ),
          ),
        );

        const onDiskRefs = yield* Effect.forEach(
          agentRoots,
          (agentRoot) =>
            skillsInDir(agentRoot, Option.none(), {
              fullDepth: false,
              includeInternal: false,
            }).pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<DiscoveredSkill>>([]))),
          { concurrency: "unbounded" },
        ).pipe(Effect.map(Array.flatten));

        const refsSortedByLocation = [...onDiskRefs].sort((a, b) =>
          a.location.localeCompare(b.location),
        );
        const onDiskByName = new Map<string, string>();
        for (const ref of refsSortedByLocation) {
          if (!onDiskByName.has(ref.skill.name)) {
            onDiskByName.set(ref.skill.name, fileUrlToPath(ref.location));
          }
        }

        const names = sortNames(
          Array.dedupe([
            ...Object.keys(installedSkills),
            ...Object.keys(unmanagedSkills),
            ...onDiskByName.keys(),
          ]),
        );

        return { names, configuredSkills, onDiskByName } as const;
      },
    ).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

    return {
      workspaceRoot: ws.baseDir,
      configuredSources: ws.getConfiguredSources().pipe(Effect.mapError(catalogUnavailable)),
      registrySourceHosts: ws.getRegistrySourceHosts().pipe(Effect.mapError(catalogUnavailable)),
      desiredExtensionGraph: ws.getDesiredStateGraph().pipe(Effect.mapError(catalogUnavailable)),
      skillCandidates,
    };
  }),
);
