/**
 * Agent facts that cross the selected scope's boundary.
 *
 * A coding agent reads the user scope and the project folder together, so a
 * lint run reports what the other side contributes to the same agent context:
 * the user scope's agent outputs and whether its workspace has readable
 * settings, and agent content in a project folder that has no workspace
 * settings to explain it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { NativeDirectoryInputs } from "@agentxm/workspace-kernel/locations";

import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import {
  decodeAbsolutePathSync,
  makeAbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";
import {
  CodingAgentRepository,
  observeAgentOutputs,
  deriveAgentOutputAuthority,
  type AgentOutputObservation,
  type NativeConfigObservationDiagnostic,
} from "@agentxm/workspace-kernel/projection";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { parseSkillMd } from "@agentxm/extension-content";
import type { AxmSkillCompatibilityPolicyService } from "@agentxm/cli-maintenance/official-skill/application";
import type { AxmSkillCompatibility } from "@agentxm/cli-maintenance/official-skill/domain";
import {
  AgentRootResolverLive,
  WorkspaceReadModelConfig,
  makeWorkspaceReadModel,
  resolveUserWorkspaceLayout,
  LOCKFILE_VERSION,
  type WorkspaceRootEscape,
} from "@agentxm/workspace-kernel/workspace-state";

/** The user scope as a project-scope run's agents also see it. */
export interface UserScopeObservation {
  readonly home: string;
  readonly settingsPath: string;
  readonly settingsReadable: boolean;
  readonly outputs: ReadonlyArray<AgentOutputObservation>;
  readonly diagnostics: ReadonlyArray<NativeConfigObservationDiagnostic>;
}

/** One agent-native file or directory in a project folder. */
export interface AgentContentEntry {
  readonly kind: "instructions" | AgentOutputObservation["extensionType"];
  readonly path: string;
  /** Entries inside a directory container; absent for a single file. */
  readonly entryCount?: number;
  readonly agentIds: ReadonlyArray<string>;
}

const NO_EXPECTED_NAMES = {
  skill: new Set<string>(),
  subagent: new Set<string>(),
  "mcp-server": new Set<string>(),
  hook: new Set<string>(),
};

/**
 * Observe the user scope's agent outputs under `userHome`.
 *
 * Containers and accepted ownership resolve in the captured user scope.
 */
export const observeUserScope = (
  userHome: string,
  nativeDirectoryInputs: NativeDirectoryInputs,
): Effect.Effect<
  UserScopeObservation,
  Config.ConfigError | WorkspaceRootEscape,
  CodingAgentRepository | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const layout = yield* resolveUserWorkspaceLayout(decodeAbsolutePathSync(userHome));
    // Readable means the same strict decode every other reader makes.
    const platformLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const observed = yield* makeWorkspaceReadModel("user").pipe(
      Effect.flatMap((model) =>
        Effect.all({
          settings: Effect.result(model.state.settings),
          lockfile: Effect.result(model.state.lockfile),
        }),
      ),
      Effect.provide(
        Layer.mergeAll(
          platformLayer,
          Layer.succeed(WorkspaceReadModelConfig, {
            nativeDirectoryInputs,
            projectRoot: makeAbsolutePath(path, userHome),
            userHome: makeAbsolutePath(path, userHome),
            allowedRoot: Option.none(),
          }),
          AgentRootResolverLive.pipe(Layer.provide(platformLayer)),
        ),
      ),
    );
    const outputAuthority = deriveAgentOutputAuthority({
      path,
      baseDir: userHome,
      layout,
      desired: { nodes: [] },
      settings: Result.isSuccess(observed.settings)
        ? Option.getOrElse(observed.settings.success, () => ({}))
        : {},
      acceptedResolutions: Result.isSuccess(observed.lockfile)
        ? Option.getOrElse(observed.lockfile.success, () => ({
            lockfileVersion: LOCKFILE_VERSION,
            skills: {},
          }))
        : { lockfileVersion: LOCKFILE_VERSION, skills: {} },
    });
    const inventory = yield* observeAgentOutputs({
      nativeDirectoryInputs,
      workspaceRoot: userHome,
      scope: "user",
      desiredAgentIds: new Set<string>(),
      expectedNames: NO_EXPECTED_NAMES,
      ...outputAuthority,
      authoredSkills: { layout, entries: {} },
    });
    return {
      home: userHome,
      settingsPath: layout.settingsPath,
      settingsReadable:
        Result.isSuccess(observed.settings) && Option.isSome(observed.settings.success),
      outputs: inventory.outputs,
      diagnostics: inventory.diagnostics,
    };
  });

const instructionPath = (
  descriptor: (typeof AGENT_DESCRIPTORS)[keyof typeof AGENT_DESCRIPTORS],
): string | undefined => {
  const instructions = descriptor.instructions;
  if (instructions === undefined) return undefined;
  return instructions.locations.find(
    (location) =>
      location.scope === "project" &&
      location.role === "primary" &&
      location.applicability.kind === "always",
  )?.path;
};

/**
 * Observe agent instruction files and non-empty agent output containers in a
 * project folder, grouped by path with the agents that read each one.
 */
export const observeProjectAgentContent = (args: {
  readonly projectRoot: string;
  readonly outputs: ReadonlyArray<AgentOutputObservation>;
}): Effect.Effect<ReadonlyArray<AgentContentEntry>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const instructionAgents = new Map<string, Set<string>>();
    for (const descriptor of Object.values(AGENT_DESCRIPTORS)) {
      const relative = instructionPath(descriptor);
      if (relative === undefined) continue;
      const agents = instructionAgents.get(relative) ?? new Set<string>();
      agents.add(descriptor.id);
      instructionAgents.set(relative, agents);
    }
    const instructions = yield* Effect.forEach(
      [...instructionAgents],
      ([relative, agents]) =>
        fs.exists(path.join(args.projectRoot, relative)).pipe(
          Effect.orElseSucceed(() => false),
          Effect.map((exists): ReadonlyArray<AgentContentEntry> =>
            exists
              ? [
                  {
                    kind: "instructions",
                    path: path.join(args.projectRoot, relative),
                    agentIds: [...agents].sort(),
                  },
                ]
              : [],
          ),
        ),
      { concurrency: 8 },
    );

    const containers = new Map<
      string,
      { kind: AgentOutputObservation["extensionType"]; count: number; agents: Set<string> }
    >();
    for (const output of args.outputs) {
      const container = containers.get(output.containerPath) ?? {
        kind: output.extensionType,
        count: 0,
        agents: new Set<string>(),
      };
      container.count += 1;
      for (const agentId of output.claimantAgentIds) container.agents.add(agentId);
      containers.set(output.containerPath, container);
    }

    return [
      ...instructions.flat(),
      ...[...containers].map(([containerPath, container]): AgentContentEntry => ({
        kind: container.kind,
        path: containerPath,
        entryCount: container.count,
        agentIds: [...container.agents].sort(),
      })),
    ].sort((left, right) => left.path.localeCompare(right.path));
  });

export interface ExposedOfficialSkill {
  readonly source: string;
  readonly paths: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
  readonly ownership: ReadonlyArray<AgentOutputObservation["ownership"]>;
  readonly compatibility: AxmSkillCompatibility;
}

/** Assess the bytes agents actually read without treating exposure as ownership. */
export const observeExposedOfficialSkills = (args: {
  readonly outputs: ReadonlyArray<AgentOutputObservation>;
  readonly agents: ReadonlySet<string>;
  readonly policy: AxmSkillCompatibilityPolicyService;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const groups = new Map<string, Array<AgentOutputObservation>>();
    for (const output of args.outputs) {
      if (
        output.extensionType !== "skill" ||
        output.entryName !== "axm" ||
        !output.claimantAgentIds.some((agent) => args.agents.has(agent)) ||
        output.nativeEntry === undefined ||
        Result.isFailure(output.nativeEntry)
      )
        continue;
      const source = output.nativeEntry.success.referentPath;
      if (source === undefined) continue;
      const group = groups.get(source) ?? [];
      group.push(output);
      groups.set(source, group);
    }
    const exposed: Array<ExposedOfficialSkill> = [];
    for (const [source, outputs] of groups) {
      const root = path.basename(source) === "src" ? path.dirname(source) : source;
      const manifest = yield* fs.readFileString(path.join(root, "skill.json")).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.fromJsonString(
              Schema.Struct({
                owner: Schema.Literal("@agentxm"),
                name: Schema.Literal("axm"),
                type: Schema.Literal("skill"),
                version: Schema.String,
              }),
            ),
          ),
        ),
        Effect.result,
      );
      // A name alone does not establish official provenance.
      if (Result.isFailure(manifest)) continue;
      const content = yield* fs
        .readFileString(path.join(source, "SKILL.md"))
        .pipe(Effect.match({ onFailure: () => Option.none<string>(), onSuccess: Option.some }));
      const skill = Option.flatMap(content, (text) => parseSkillMd(text, "axm"));
      const compatibility = args.policy.evaluate({
        fqn: "@agentxm/skills/axm",
        candidate: {
          manifestVersion: manifest.success.version,
          metadata: Option.getOrNull(Option.flatMap(skill, (parsed) => parsed.metadata)),
          source,
          authority: null,
        },
      });
      if (compatibility === null || compatibility.status === "compatible") continue;
      exposed.push({
        source,
        paths: [...new Set(outputs.map((output) => output.path))].sort(),
        agents: [
          ...new Set(
            outputs
              .flatMap((output) => output.claimantAgentIds)
              .filter((id) => args.agents.has(id)),
          ),
        ].sort(),
        ownership: [...new Set(outputs.map((output) => output.ownership))],
        compatibility,
      });
    }
    return exposed;
  });
