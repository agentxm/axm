import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  CodingAgentRepository,
  evaluateAxmSkillCompatibility,
  replaceCanonicalDirectory,
} from "@agentxm/extension-workspace";
import { ensureSkillAgentArtifact } from "@agentxm/extension-lifecycle";
import { WorkspaceMutations, sanitizeName } from "@agentxm/workspace-state";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";

import {
  AXM_SKILL_JSON,
  AXM_SKILL_CLI_VERSION,
  AXM_SKILL_CLI_VERSION_RANGE,
  AXM_SKILL_SOURCE_FILES,
  AXM_SKILL_VERSION,
} from "../../../__generated__/bundled-axm-skill.js";
import { makeAppError } from "../../../app-error/index.js";
import { toAppError } from "../../../app-error/conversions.js";
import { loadVersion } from "../../../version.js";

const BUNDLED_AXM_SKILL_NAME = sanitizeName("axm");

export const BUNDLED_AXM_SKILL_AUTHORED_BLOCKER =
  "The official AXM skill is workspace-authored; bundled recovery will not overwrite its in-flight source.";

export type BundledAxmSkillReadiness =
  | {
      readonly readiness: "ready";
      readonly canonicalPath: string;
    }
  | {
      readonly readiness: "error";
      readonly canonicalPath: string;
      readonly errorMessage: string;
    };

export const bundledAxmSkillCanonicalPath = (
  ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>,
  path: Path.Path,
): string => path.join(ws.layout.acquiredRoot, "agentxm", "@agentxm", "skills", "axm");

export const inspectBundledAxmSkillReadiness = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;
  const configured = yield* ws.getConfiguredSkillEntries();
  const existing = configured[BUNDLED_AXM_SKILL_NAME];
  const canonicalPath = bundledAxmSkillCanonicalPath(ws, path);
  return existing?.source === "workspace" && existing.origin !== "bundled"
    ? ({
        readiness: "error",
        canonicalPath,
        errorMessage: BUNDLED_AXM_SKILL_AUTHORED_BLOCKER,
      } satisfies BundledAxmSkillReadiness)
    : ({ readiness: "ready", canonicalPath } satisfies BundledAxmSkillReadiness);
});

const authoredSourceConflict = makeAppError({
  code: "conflict",
  detail: BUNDLED_AXM_SKILL_AUTHORED_BLOCKER,
  recover: "Preserve the authored skill and inspect executable compatibility guidance",
  cmd: "axm help upgrade",
});

const mapBundledSkillWriteError = (filePath: string) => (cause: unknown) =>
  makeAppError({
    code: "internal",
    detail: `Failed to write bundled AXM skill file: ${filePath}`,
    cause,
  });

const materializeBundledAxmSkill = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const canonicalPath = bundledAxmSkillCanonicalPath(ws, path);
  const skillSrcPath = path.join(canonicalPath, "src");
  const fsPathLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, fsPathLayer);

  yield* replaceCanonicalDirectory({
    baseDir: ws.baseDir,
    canonicalPath,
    populate: (stagingPath) => {
      const stagingSrcPath = path.join(stagingPath, "src");
      const skillJsonPath = path.join(stagingPath, "skill.json");
      return Effect.gen(function* () {
        yield* fs
          .makeDirectory(stagingSrcPath, { recursive: true })
          .pipe(Effect.mapError(mapBundledSkillWriteError(stagingSrcPath)));
        yield* fs
          .writeFileString(skillJsonPath, AXM_SKILL_JSON)
          .pipe(Effect.mapError(mapBundledSkillWriteError(skillJsonPath)));
        yield* Effect.forEach(
          AXM_SKILL_SOURCE_FILES,
          (sourceFile) => {
            const destination = path.join(stagingSrcPath, sourceFile.path);
            return fs
              .makeDirectory(path.dirname(destination), { recursive: true })
              .pipe(
                Effect.andThen(fs.writeFile(destination, Buffer.from(sourceFile.base64, "base64"))),
                Effect.mapError(mapBundledSkillWriteError(destination)),
              );
          },
          { concurrency: "unbounded", discard: true },
        );
      });
    },
  });

  const configuredAgents = yield* agentRepo
    .getConfiguredAgents()
    .pipe(Effect.provideService(WorkspaceMutations, ws));
  const resolvedAgents = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir }).pipe(
        Effect.provide(fsPathLayer),
        Effect.map((outcome) => ({ agentId: agent.id, outcome })),
      ),
    { concurrency: "unbounded" },
  );
  const misconfigured = resolvedAgents.filter(({ outcome }) => outcome._tag === "misconfigured");
  if (misconfigured.length > 0) {
    return yield* makeAppError({
      code: "validation",
      detail: "One or more configured agents have invalid skills directory settings",
    });
  }

  const installTargets = resolvedAgents.flatMap(({ outcome }) =>
    outcome._tag === "supported" ? [path.normalize(outcome.dir)] : [],
  );
  const distinctTargets = [...new Set(installTargets)];

  yield* Effect.forEach(
    distinctTargets,
    (targetDir) =>
      ensureSkillAgentArtifact({
        canonicalSkillSrcPath: skillSrcPath,
        targetDir,
        sanitizedName: BUNDLED_AXM_SKILL_NAME,
        pathService: path,
        baseDir: ws.baseDir,
        provide,
      }),
    { concurrency: "unbounded" },
  );

  yield* ws.setSkillEntry(BUNDLED_AXM_SKILL_NAME, {
    source: "workspace",
    enabled: true,
    origin: "bundled",
  });
  yield* ws.removeSkillLock(BUNDLED_AXM_SKILL_NAME);
});

/** Install the embedded official AXM skill as one rollback-safe workspace transition. */
export const installBundledAxmSkill = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const readiness = yield* inspectBundledAxmSkillReadiness;
  if (readiness.readiness === "error") {
    return yield* authoredSourceConflict;
  }
  const configuredAgents = yield* agentRepo
    .getConfiguredAgents()
    .pipe(Effect.provideService(WorkspaceMutations, ws));
  const targetDirectories = yield* Effect.forEach(
    configuredAgents,
    (agent) =>
      agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.map((outcome) =>
          outcome._tag === "supported"
            ? [path.join(path.normalize(outcome.dir), BUNDLED_AXM_SKILL_NAME)]
            : [],
        ),
      ),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((paths) => paths.flat()));
  const captured = Layer.mergeAll(
    Layer.succeed(WorkspaceMutations, ws),
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
    Layer.succeed(CodingAgentRepository, agentRepo),
  );

  yield* ws
    .runTransaction({
      targets: [readiness.canonicalPath, ...targetDirectories],
      transition: materializeBundledAxmSkill.pipe(Effect.provide(captured)),
      validate: () =>
        Effect.gen(function* () {
          const configured = yield* ws.getConfiguredSkillEntries();
          const installedEntry = configured[BUNDLED_AXM_SKILL_NAME];
          if (installedEntry?.source !== "workspace" || installedEntry.origin !== "bundled") {
            return yield* makeAppError({
              code: "internal",
              detail: "Bundled AXM skill did not retain its bundled source authority",
            });
          }
          const locked = yield* ws.getLockedSkill(BUNDLED_AXM_SKILL_NAME);
          if (Option.isSome(locked)) {
            return yield* makeAppError({
              code: "internal",
              detail: "Bundled AXM skill retained a superseded accepted external resolution",
            });
          }
          const compatibility = evaluateAxmSkillCompatibility({
            cliVersion: loadVersion(),
            skill: {
              manifestVersion: AXM_SKILL_VERSION,
              source: `bundled:@agentxm/skills/axm@${AXM_SKILL_VERSION}`,
              metadata: {
                [AXM_SKILL_CLI_VERSION_METADATA_KEY]: AXM_SKILL_CLI_VERSION,
                [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: AXM_SKILL_CLI_VERSION_RANGE,
              },
            },
          });
          if (compatibility.status === "incompatible") {
            return yield* makeAppError({
              code: "internal",
              detail:
                compatibility.detail ??
                "Bundled AXM skill remained incompatible after workspace installation",
              ...(compatibility.recovery.nextAction === null
                ? {}
                : { cmd: compatibility.recovery.nextAction }),
            });
          }
        }),
    })
    .pipe(Effect.mapError(toAppError));
});
