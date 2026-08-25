import * as crypto from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "../app-error/index.js";
import { LOCKFILE_NAME } from "../lockfile/index.js";
import { SETTINGS_FILENAME } from "../settings/index.js";
import type { Plan } from "./plan.js";

export interface ExecutionCandidate<Requirements = never, Output = never> {
  readonly id: string;
  readonly plan: Plan<Requirements, Output>;
  readonly materialPaths: ReadonlyArray<string>;
  readonly materialFingerprint: string;
  /** Base the material fingerprint is relative to; freshness recomputes against it. */
  readonly baseDir: string;
}

const collectArtifactPaths = (plan: Plan<unknown, unknown>): ReadonlyArray<string> =>
  plan.jobs.flatMap((job) =>
    job.steps.flatMap((step) => {
      if (step.artifact === undefined) return [];
      return [step.artifact.path, ...(step.artifact.targets ?? []).map((target) => target.path)];
    }),
  );

const resolveMaterialPaths = (
  plan: Plan<unknown, unknown>,
  workspaceDir: string,
  baseDir: string,
  path: Path.Path,
): ReadonlyArray<string> =>
  Array.from(
    new Set(
      [
        path.join(workspaceDir, SETTINGS_FILENAME),
        path.join(workspaceDir, LOCKFILE_NAME),
        ...(plan.materialPaths ?? []),
        ...collectArtifactPaths(plan),
      ].map((candidate) => path.resolve(baseDir, candidate)),
    ),
  ).sort();

const fingerprintPath = (
  target: string,
  label: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<ReadonlyArray<Uint8Array | string>, AppError> =>
  Effect.gen(function* () {
    const link = yield* fs.readLink(target).pipe(Effect.option);
    if (Option.isSome(link)) return [label, "symlink", link.value];

    const info = yield* fs.stat(target).pipe(Effect.option);
    if (Option.isNone(info)) return [label, "absent"];
    if (info.value.type === "File") return [label, "file", yield* fs.readFile(target)];
    if (info.value.type !== "Directory") return [label, info.value.type];

    const entries = [...(yield* fs.readDirectory(target, { recursive: true }))].sort();
    const parts: Array<Uint8Array | string> = [label, "directory"];
    for (const entry of entries) {
      const absolute = path.join(target, entry);
      const entryInfo = yield* fs.stat(absolute);
      parts.push(entry, entryInfo.type);
      if (entryInfo.type === "File") parts.push(yield* fs.readFile(absolute));
      if (entryInfo.type === "SymbolicLink") parts.push(yield* fs.readLink(absolute));
    }
    return parts;
  }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: `Failed to fingerprint execution material at ${target}`,
        cause,
      }),
    ),
  );

// Materials hash under their base-relative names: candidate identity is a
// property of workspace content, not of where the workspace sits on disk.
const fingerprintMaterials = (
  materialPaths: ReadonlyArray<string>,
  baseDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<string, AppError> =>
  Effect.gen(function* () {
    const hash = crypto.createHash("sha256");
    for (const target of materialPaths) {
      const parts = yield* fingerprintPath(target, path.relative(baseDir, target), fs, path);
      for (const part of parts) {
        hash.update(part);
        hash.update("\0");
      }
    }
    return hash.digest("hex");
  });

// Absolute paths inside plan metadata relativize before hashing: candidate
// identity is a property of workspace content, not of where it sits on disk.
const planIdentity = (plan: Plan<unknown, unknown>, baseDir: string, path: Path.Path): string =>
  JSON.stringify(
    {
      name: plan.name,
      jobs: plan.jobs.map((job) => ({
        concurrency: job.concurrency,
        executionPolicy: job.executionPolicy,
        steps: job.steps.map((step) => ({
          key: step.key,
          dependsOn: step.dependsOn,
          label: step.label,
          readiness: step.readiness,
          artifact: step.artifact,
          registryLifecycle: step.registryLifecycle,
        })),
      })),
      preconditions: plan.preconditions,
      riskConditions: plan.riskConditions,
      releaseAge: plan.releaseAge,
    },
    (key, value: unknown) => {
      if (key === "evaluatedAt") return undefined;
      return typeof value === "string" && path.isAbsolute(value)
        ? path.relative(baseDir, value)
        : value;
    },
  );

export const makeExecutionCandidate = <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  workspaceDir: string,
  baseDir: string,
): Effect.Effect<
  ExecutionCandidate<Requirements, Output>,
  AppError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const materialPaths = resolveMaterialPaths(plan, workspaceDir, baseDir, path);
    const materialFingerprint = yield* fingerprintMaterials(materialPaths, baseDir, fs, path);
    const id = crypto
      .createHash("sha256")
      .update(planIdentity(plan, baseDir, path))
      .update("\0")
      .update(materialFingerprint)
      .digest("hex");
    return { id, plan, materialPaths, materialFingerprint, baseDir };
  });

export const isExecutionCandidateFresh = (
  candidate: ExecutionCandidate<unknown, unknown>,
): Effect.Effect<boolean, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const current = yield* fingerprintMaterials(
      candidate.materialPaths,
      candidate.baseDir,
      fs,
      path,
    );
    return current === candidate.materialFingerprint;
  });
