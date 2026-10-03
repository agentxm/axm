/** Explicit transfer of existing skill installations from an external manager. */
import * as crypto from "node:crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { PlatformError } from "effect/PlatformError";
import { envOption, writeFileAtomic } from "@agentxm/host-primitives";
import { planSkillInstallationStep } from "@agentxm/extension-kinds/skills";
import { SourceHostProviders, resolveSource } from "@agentxm/workspace-kernel/sources";
import { CodingAgentRepository } from "@agentxm/workspace-kernel/projection";
import { resolveNativeEntry, resolveNativeReferent } from "@agentxm/workspace-kernel/locations";
import {
  computeMaterializedTreeIntegrity,
  SettingsReader,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  installRefused,
  operationPresentation,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-kernel/operations";
import {
  prepareExecutionCandidate,
  resolveExecutionCandidate,
} from "@agentxm/workspace-kernel/planning";
import {
  protectWorkspacePath,
  recordFootprint,
  retireWorkspacePath,
} from "@agentxm/workspace-kernel/settlement";
import {
  kernelFailureToStepFailure,
  type InstallStepRequirements,
} from "@agentxm/workspace-kernel/reconciliation";

const RecordSchema = Schema.Record(Schema.String, Schema.Unknown);
const decodeRecord = Schema.decodeUnknownEffect(RecordSchema);
const stringField = (record: Readonly<Record<string, unknown>>, key: string) => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};
const failed = (detail: string, cause?: unknown) =>
  installRefused({ category: "validation", detail, ...(cause === undefined ? {} : { cause }) });

/** Preserve the upstream lock's unknown fields; only selected skill entries are retired. */
const readManagerLock = (lockPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(lockPath);
    const parsed = yield* Effect.try((): unknown => JSON.parse(raw));
    const document = yield* decodeRecord(parsed);
    if (document["version"] !== 1 && document["version"] !== 3) {
      return yield* failed(`Unsupported Skills lock version in ${lockPath}`);
    }
    const skills = yield* decodeRecord(document["skills"]);
    return { raw, document, skills };
  }).pipe(
    Effect.mapError((cause) => failed(`Cannot read Skills manager lock at ${lockPath}`, cause)),
  );

/** The project lock's published hash algorithm, used solely to detect local edits. */
const projectContentHash = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries: string[] = [];
    const collect = (directory: string): Effect.Effect<void, PlatformError> =>
      Effect.gen(function* () {
        for (const entry of yield* fs.readDirectory(directory)) {
          const absolute = path.join(directory, entry);
          if (Option.isSome(yield* fs.readLink(absolute).pipe(Effect.option))) continue;
          const info = yield* fs.stat(absolute);
          if (info.type === "File") entries.push(path.relative(root, absolute));
          else if (info.type === "Directory" && entry !== ".git" && entry !== "node_modules")
            yield* collect(absolute);
        }
      });
    yield* collect(root);
    entries.sort((left, right) => left.localeCompare(right));
    const hash = crypto.createHash("sha256");
    for (const entry of entries) {
      const absolute = path.join(root, entry);
      hash.update(entry.split(path.sep).join("/"));
      hash.update(yield* fs.readFile(absolute));
    }
    return hash.digest("hex");
  });

export interface HandoffRequest {
  readonly lockPath?: string;
  readonly skills: ReadonlyArray<string>;
  readonly all: boolean;
}

const defaultLockPath = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const path = yield* Path.Path;
  if (location.scope === "project") return path.join(location.baseDir, "skills-lock.json");
  const stateHome = yield* envOption("XDG_STATE_HOME");
  return Option.isSome(stateHome) && stateHome.value.length > 0
    ? path.join(stateHome.value, "skills", ".skill-lock.json")
    : path.join(location.baseDir, ".agents", ".skill-lock.json");
});

const sourceIntent = (entry: Readonly<Record<string, unknown>>, lockPath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const sourceType = stringField(entry, "sourceType");
    if (
      sourceType === undefined ||
      !["github", "gitlab", "git", "local", "node_modules", "well-known", "download"].includes(
        sourceType,
      )
    )
      return yield* failed("The manager record uses an unsupported source type; it was preserved");
    const source = stringField(entry, "sourceUrl") ?? stringField(entry, "source");
    if (source === undefined) return yield* failed("The manager record has no source locator");
    const locator =
      sourceType === "local" || sourceType === "node_modules"
        ? path.resolve(path.dirname(lockPath), source)
        : (sourceType === "github" || sourceType === "gitlab") && !source.includes(":")
          ? `${sourceType}:${source}`
          : source;
    const resolved = yield* resolveSource(locator);
    const revision = stringField(entry, "ref");
    return resolved.type === "git" && revision !== undefined
      ? { ...resolved, ref: Option.some(revision) }
      : resolved;
  });

export const prepareHandoff = Effect.fn("Handoff.prepare")(function* (request: HandoffRequest) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const location = yield* WorkspaceLocation;
  const providers = yield* SourceHostProviders;
  const settings = yield* SettingsReader;
  if ((yield* settings.configuredAgents).length === 0)
    return yield* failed(
      "Choose agent destinations before transferring management; use --agent on first handoff",
    );
  const agents = yield* (yield* CodingAgentRepository).all;
  const requestedLockPath =
    request.lockPath === undefined
      ? yield* defaultLockPath
      : path.resolve(location.baseDir, request.lockPath);
  const lockPath = yield* resolveNativeReferent(requestedLockPath);
  const original = yield* readManagerLock(lockPath);
  const names = request.all ? Object.keys(original.skills).sort() : [...new Set(request.skills)];
  if (names.length === 0) return yield* failed("Select manager entries with --skill or --all");
  const configured = yield* settings.entries("skill");
  const directories = [path.join(location.baseDir, ".agents", "skills")];
  for (const agent of agents) {
    const target = yield* agent.resolveEffectiveSkillsDir({
      workspaceRoot: location.baseDir,
      scope: location.scope,
    });
    if (target._tag === "supported") directories.push(target.dir);
  }
  const steps: Array<PlannedJobStep<InstallStepRequirements>> = [];
  for (const name of names) {
    if (name === "." || name === ".." || name.includes("/") || name.includes("\\"))
      return yield* failed(`Invalid manager skill key: ${name}`);
    if (configured[name] !== undefined)
      return yield* failed(`Skill ${name} is already configured by AXM`);
    const entry = yield* decodeRecord(original.skills[name]).pipe(
      Effect.mapError((cause) => failed(`No readable manager entry for ${name}`, cause)),
    );
    const source = yield* sourceIntent(entry, requestedLockPath).pipe(
      Effect.mapError((cause) => failed(`Cannot resolve the recorded source for ${name}`, cause)),
    );
    const skillPath = stringField(entry, "skillPath")?.replace(/(?:^|\/)SKILL\.md$/u, "") || ".";
    const candidates = (yield* providers.find(source, {
      names: [],
      owner: Option.none(),
      type: "skill",
      versionRange: Option.none(),
    })).filter((ref) => ref.type === "skill");
    const matches = candidates.filter((ref) =>
      skillPath !== "."
        ? (ref.refType === "git-hosted" && ref.sourcePath === skillPath) ||
          (ref.refType === "local" && ref.sourceRelativePath === skillPath) ||
          (ref.refType === "http" && ref.sourcePath === skillPath)
        : ref.name === name || candidates.length === 1,
    );
    const ref = matches.length === 1 ? matches[0] : undefined;
    if (ref === undefined)
      return yield* failed(`The recorded source for ${name} does not select exactly one skill`);
    if (ref.name !== name)
      return yield* failed(
        `The source now installs as ${ref.name}; preserve ${name} and install the source explicitly to choose its identity`,
      );
    const upstream = yield* providers.fetch(ref);
    const upstreamIntegrity = yield* computeMaterializedTreeIntegrity(upstream.directory);
    const targets: Array<string> = [];
    const materialPaths: Array<string> = [requestedLockPath, lockPath];
    const known = new Set<string>();
    for (const directory of directories) {
      const target = yield* resolveNativeEntry(path.join(directory, name));
      if (target.kind === "absent" || known.has(target.entryPath)) continue;
      known.add(target.entryPath);
      const referent = yield* resolveNativeReferent(target.entryPath);
      const integrity = yield* computeMaterializedTreeIntegrity(referent);
      const expected = stringField(entry, "computedHash");
      if (
        (expected !== undefined && (yield* projectContentHash(referent)) !== expected) ||
        integrity !== upstreamIntegrity
      ) {
        return yield* failed(
          `Preserved ${name}: installed content differs from its recorded hash or resolved source at ${target.entryPath}. Keep local edits, or restore the intended source before handoff.`,
        );
      }
      targets.push(target.entryPath);
      materialPaths.push(target.entryPath, referent);
    }
    if (targets.length === 0)
      return yield* failed(
        `No installed native copy of ${name} was found; the manager entry was preserved`,
      );
    const install = yield* planSkillInstallationStep({
      ref,
      versionRange: Option.none(),
      force: false,
    });
    if (install.readiness === "error") {
      steps.push(install);
      continue;
    }
    const run = Effect.gen(function* () {
      // Candidate fingerprints and this read protect both local bytes and foreign lock entries.
      const current = yield* readManagerLock(lockPath);
      const recorded = current.skills[name];
      if (JSON.stringify(recorded) !== JSON.stringify(original.skills[name]))
        return yield* failed(`Manager entry ${name} changed before handoff`);
      for (const target of targets) yield* retireWorkspacePath(target);
      const result = yield* install.run;
      if (result.result === "error") return result;
      const retained = Object.fromEntries(
        Object.entries(current.skills).filter(([key]) => key !== name),
      );
      yield* protectWorkspacePath(lockPath);
      yield* writeFileAtomic(fs, {
        targetPath: lockPath,
        content: `${JSON.stringify({ ...current.document, skills: retained }, null, 2)}\n`,
        mapError: ({ cause }) =>
          installRefused({
            category: "unavailable",
            detail: `Cannot update Skills manager lock at ${lockPath}`,
            cause,
          }),
      }).pipe(
        Effect.andThen(recordFootprint({ path: lockPath, change: "modified" })),
        Effect.uninterruptible,
      );
      return { ...result, message: `Transferred ${name} to AXM` };
    }).pipe(Effect.mapError(kernelFailureToStepFailure));
    steps.push({ ...install, materialPaths, run });
  }
  const plan: Plan<InstallStepRequirements> = {
    _tag: "Plan",
    name: "Transfer skill management",
    description: Option.some(
      "Preserve installed skill content and transfer selected manager entries to AXM",
    ),
    presentation: operationPresentation(
      { imperative: "transfer", past: "Transferred", gerund: "Transferring" },
      "skill",
    ),
    jobs: [{ concurrency: 1, steps }],
  };
  return yield* prepareExecutionCandidate(plan);
});

export const HandoffSkills = {
  prepare: prepareHandoff,
  previewOrApply: (
    candidate: Effect.Success<ReturnType<typeof prepareHandoff>>,
    execution: PlanExecution,
  ) => resolveExecutionCandidate(candidate, execution),
} as const;
