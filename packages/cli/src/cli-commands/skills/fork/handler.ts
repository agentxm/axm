/**
 * Fork command handler — Effect-based orchestration for `axm skills fork`.
 *
 * Converts an unmanaged skill into a managed extension:
 * 1. Registry guard (ensure registry configured)
 * 2. Parse source via resolveSource
 * 3. Scope resolution
 * 4. Discover skills via SourceProviders
 * 5. Filter by --skill globs (if provided)
 * 6. Build plan: fork → publish → install (sequential)
 * 7. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import {
  resolveSource,
  printSourceInput,
  SourceProviders,
  registryGuard,
} from "../../../sources/index.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace as Workspace } from "../../../workspace/index.js";
import { getAgentById } from "../../../agents/index.js";
import { discoverSkillsInDir } from "../install/discover-skills.js";
import type {
  CopySkillOperation,
  InstallSkillOperation,
  InstallSkillOperationArgs,
  PublishSkillOperation,
} from "../operations.js";
import { copySkill } from "../copy-skill.js";
import { installSkill } from "../install/install-skill.js";
import { publishSkill } from "../publish-skill.js";
import { expandGlobs, isGlobPattern } from "../../../skills/index.js";
import { REGISTRY_EXTENSIONS_DIR } from "../constants.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import type { SkillRef, Source } from "../../../sources/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the fork command.
 */
export interface ForkHandlerArgs {
  /** Source string or glob pattern (installed skill name, local path, github:owner/repo, etc.). */
  readonly source: string;
  /** Fork only specified skill(s) by name or glob pattern. */
  readonly skills: readonly string[];
  /** Skip confirmations. */
  readonly yes: boolean;
}

type ForkOp = CopySkillOperation | PublishSkillOperation | InstallSkillOperation;

const sortNames = (names: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...names].sort((a, b) => a.localeCompare(b));

const buildGlobCandidates = (
  args: {
    readonly base: string;
    readonly joinPath: (left: string, right: string) => string;
    readonly lockedSkills: Readonly<Record<string, unknown>>;
    readonly configuredSkills: Readonly<Record<string, { readonly source: Option.Option<string> }>>;
    readonly configuredAgents: ReadonlyArray<string>;
  },
) =>
  Effect.gen(function* () {
    const agentRoots = sortNames(
      Array.dedupe(
        Array.getSomes(
          Array.map(args.configuredAgents, (agentId) =>
            Option.map(getAgentById(agentId), (agent) => args.joinPath(args.base, agent.skills.dir)),
          ),
        ),
      ),
    );

    const onDiskRefs = yield* Effect.forEach(
      agentRoots,
      (agentRoot) =>
        discoverSkillsInDir(
          agentRoot,
          Option.none(),
          { fullDepth: false, includeInternal: false },
          { type: "local", path: agentRoot },
        ).pipe(Effect.catchAll(() => Effect.succeed<ReadonlyArray<SkillRef>>([]))),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));

    const refsSortedByLocation = [...onDiskRefs].sort((a, b) => a.location.localeCompare(b.location));
    const onDiskByName = new Map<string, string>();
    for (const ref of refsSortedByLocation) {
      if (!onDiskByName.has(ref.skill.name)) {
        onDiskByName.set(ref.skill.name, ref.location.replace("file://", ""));
      }
    }

    const names = sortNames(
      Array.dedupe([
        ...Object.keys(args.lockedSkills),
        ...Object.keys(args.configuredSkills),
        ...onDiskByName.keys(),
      ]),
    );

    return { names, onDiskByName } as const;
  });

const resolveGlobMatchedSource = (
  name: string,
  configuredSkills: Readonly<Record<string, { readonly source: Option.Option<string> }>>,
  onDiskByName: ReadonlyMap<string, string>,
) =>
  resolveSource(name).pipe(
    Effect.catchTag("CliError", (error) => {
      if (error.code !== "SOURCE_PARSE_FAILED") {
        return Effect.fail(error);
      }

      const configuredEntry = configuredSkills[name];
      if (configuredEntry !== undefined && Option.isSome(configuredEntry.source)) {
        return resolveSource(configuredEntry.source.value);
      }

      const diskPath = onDiskByName.get(name);
      if (diskPath !== undefined) {
        const localSource: Source = { type: "local", path: diskPath };
        return Effect.succeed(localSource);
      }

      return Effect.fail(error);
    }),
  );

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills fork` command.
 */
export const handleFork = (args: ForkHandlerArgs) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const path = yield* Path.Path;
    const log = yield* Log;
    const spinnerSvc = yield* Spinner;
    const sources = yield* SourceProviders;
    const base = path.dirname(ws.path);

    yield* log.info("axm skills fork");

    // Step 1: Registry guard
    yield* registryGuard;

    // Step 2: Resolve scope
    const scope = yield* ws.getConfiguredScope().pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "SCOPE_RESOLUTION_FAILED",
          what: `Failed to resolve scope: ${e._tag}`,
          howToFix: "Configure a scope in your settings with `axm init`.",
          cause: e,
        }),
      ),
    );

    // Step 3: Parse source and discover skills
    const handle = yield* spinnerSvc.start("Resolving skills...");

    const discoveredSkills = yield* (isGlobPattern(args.source)
      ? Effect.gen(function* () {
          const lockedSkills = yield* ws.getLockedSkills();
          const configuredSkills = yield* ws.getConfiguredSkills();
          const configuredAgents = yield* ws.getConfiguredAgents();
          const candidates = yield* buildGlobCandidates({
            base,
            joinPath: path.join,
            lockedSkills,
            configuredSkills,
            configuredAgents,
          });
          const matchedNames = expandGlobs([args.source], candidates.names);

          if (matchedNames.length === 0) {
            yield* handle.stop("No matches");
            return yield* Effect.fail(
              makeCliError({
                code: "NO_SKILLS_MATCHED",
                what: "No skills matched the given patterns",
                details: [`Patterns: ${args.source}`, `Available: ${candidates.names.join(", ")}`],
                howToFix: "Check installed skill names with `axm skills list`.",
              }),
            );
          }

          const refsBySource = yield* Effect.forEach(
            sortNames(matchedNames),
            (name) =>
              Effect.gen(function* () {
                const source = yield* resolveGlobMatchedSource(
                  name,
                  configuredSkills,
                  candidates.onDiskByName,
                ).pipe(
                  Effect.mapError((error) =>
                    makeCliError({
                      code: "INVALID_SOURCE",
                      what: `Invalid source: ${error.message}`,
                      details: [`Provided: ${name}`],
                      howToFix: "Valid formats: installed skill name, local path, github:owner/repo",
                      cause: error,
                    }),
                  ),
                );
                return yield* sources.resolveExtension(source, {
                  names: [],
                  agents: [],
                  type: "skill",
                });
              }),
            { concurrency: "unbounded" },
          ).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "DISCOVER_FAILED",
                what: `Failed to discover skills: ${error.message}`,
                details: [`Source pattern: ${args.source}`],
                howToFix: "Verify the matched source skills are installed and valid.",
                cause: error,
              }),
            ),
            Effect.tapError(() => handle.stop("Failed")),
          );

          return Array.filter(
            Array.flatten(refsBySource),
            (ref): ref is SkillRef => ref.type === "skill",
          );
        })
      : Effect.gen(function* () {
          const source = yield* resolveSource(args.source).pipe(
            Effect.mapError((error) =>
              makeCliError({
                code: "INVALID_SOURCE",
                what: `Invalid source: ${error.message}`,
                details: [`Provided: ${args.source}`],
                howToFix: "Valid formats: installed skill name, local path, github:owner/repo",
                cause: error,
              }),
            ),
            Effect.tapError(() => handle.stop("Failed")),
          );

          const allRefs = yield* sources
            .resolveExtension(source, { names: [], agents: [], type: "skill" })
            .pipe(
              Effect.mapError((error) =>
                makeCliError({
                  code: "DISCOVER_FAILED",
                  what: `Failed to discover skills: ${error.message}`,
                  details: [`Source: ${printSourceInput(source)}`],
                  howToFix: "Verify the source path contains directories with SKILL.md files.",
                  cause: error,
                }),
              ),
              Effect.tapError(() => handle.stop("Failed")),
            );

          const skills = Array.filter(allRefs, (ref): ref is SkillRef => ref.type === "skill");
          if (skills.length === 0) {
            yield* handle.stop("No skills found");
            return yield* Effect.fail(
              makeCliError({
                code: "NO_SKILLS_FOUND",
                what: "No skills found in source",
                details: [`Source: ${printSourceInput(source)}`],
                howToFix: "Verify the source path contains directories with SKILL.md files.",
              }),
            );
          }
          return skills;
        }));

    // Step 4: Filter by --skill globs (if provided)
    const filtered: ReadonlyArray<SkillRef> =
      args.skills.length > 0
        ? (() => {
            const allNames = Array.map(discoveredSkills, (r) => r.skill.name);
            const matched = expandGlobs(args.skills, allNames);
            if (matched.length === 0) {
              // Yield an error — cannot be done inside the IIFE, so return empty and check below
              return [];
            }
            return Array.filter(discoveredSkills, (s) => matched.includes(s.skill.name));
          })()
        : discoveredSkills;

    if (args.skills.length > 0 && filtered.length === 0) {
      yield* handle.stop("No matches");
      const allNames = Array.map(discoveredSkills, (r) => r.skill.name);
      return yield* Effect.fail(
        makeCliError({
          code: "NO_SKILLS_MATCHED",
          what: "No skills matched the given patterns",
          details: [`Patterns: ${args.skills.join(", ")}`, `Available: ${allNames.join(", ")}`],
          howToFix: "Check skill names with `axm skills install --list <source>`.",
        }),
      );
    }

    yield* handle.stop(`Found ${filtered.length} skill(s)`);

    // Step 5: Get agents from workspace
    const agentIds = yield* ws.getConfiguredAgents();

    // Step 6: Determine first registry source name for publishing
    const registrySources = yield* ws.getConfiguredRegistrySources(Option.none()).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "REGISTRY_SOURCES_FAILED",
          what: `Failed to get registry sources: ${e._tag}`,
          cause: e,
        }),
      ),
    );
    if (registrySources.length === 0) {
      return yield* Effect.fail(
        makeCliError({
          code: "NO_REGISTRY_CONFIGURED",
          what: "No registry sources configured",
          howToFix: "Run the registry guard first.",
        }),
      );
    }
    const registryName = registrySources[0]!.name;

    // Step 7: Build plan — fork + publish + install per skill (3 sequential ops)
    const steps: ReadonlyArray<PlannedJobStep<ForkOp>> = Array.flatMap(filtered, (ref) => {
      const targetName = `${scope}/${ref.skill.name}`;
      const installArgs: InstallSkillOperationArgs = {
        source: { type: "registry", scope, name: ref.skill.name, versionConstraint: Option.none() },
        agents: [...agentIds],
        force: true,
        skill: {
          name: ref.skill.name,
          description: ref.skill.description,
          metadata: ref.skill.metadata,
        },
        location:
          "file://" +
          path.join(base, REGISTRY_EXTENSIONS_DIR, scope, "skills", ref.skill.name, "src"),
        version: Option.some("0.1.0"),
        gitTreeSha: Option.none(),
      };
      return [
        {
          _tag: "PlannedJobStep" as const,
          operation: {
            name: "copy-skill",
            args: {
              source: {
                type: "local",
                path: ref.location.replace(/^file:\/\//, ""),
              } satisfies CopySkillOperation["args"]["source"],
              targetName,
              location: ref.location,
            },
          } satisfies CopySkillOperation,
          expectedResult: {
            result: "success",
            message: `Copied ${ref.skill.name} to ${targetName}`,
          },
          label: `Fork ${ref.skill.name}`,
        },
        {
          _tag: "PlannedJobStep" as const,
          operation: {
            name: "publish-skill",
            args: {
              name: targetName,
              registryName,
            },
          } satisfies PublishSkillOperation,
          expectedResult: { result: "success", message: `Published ${targetName}` },
          label: `Publish ${targetName}`,
        },
        {
          _tag: "PlannedJobStep" as const,
          operation: {
            name: "install-skill",
            args: installArgs,
          } satisfies InstallSkillOperation,
          expectedResult: { result: "success", message: `Installed ${ref.skill.name}` },
          label: `Install ${ref.skill.name}`,
        },
      ];
    });

    const plan = {
      name: "Fork skill(s)",
      description: Option.some(`Fork and publish ${filtered.length} skill(s)`),
      jobs: [{ steps, concurrency: 1 as const }],
    };

    yield* ws.resolvePlan(plan, {
      "copy-skill": copySkill,
      "publish-skill": publishSkill,
      "install-skill": installSkill,
    });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("Fork.handle"));
