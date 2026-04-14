import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { sanitizeName } from "../../../extensions/utils.js";
import {
  buildWorkspaceSkillSnapshot,
  isResolvedWorkspaceSkill,
  type WorkspaceSkillSnapshot,
} from "../../skill-snapshot.js";
import { defineCheck, type DiagnosticDef } from "../check-def.js";
import { CHECK_IDS, type Action, type Finding } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentDirArtifact {
  readonly name: string;
  readonly path: string;
  readonly isSymlink: boolean;
  readonly targetExists: boolean;
}

interface AgentDirScan {
  readonly agentId: string;
  readonly dir: string;
  readonly artifacts: ReadonlyArray<AgentDirArtifact>;
}

/** Map from skill name to the expected artifact basename (precomputed). */
type ArtifactNameMap = ReadonlyMap<string, string>;

interface ExtensionsActiveContext {
  readonly snapshot: WorkspaceSkillSnapshot;
  readonly agentDirScans: ReadonlyArray<AgentDirScan>;
  /** Precomputed artifact basenames keyed by skill name (resolved skills only). */
  readonly artifactNames: ArtifactNameMap;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYNC_ACTION: Action = {
  label: "Run axm sync",
  description: "Reconcile installed extensions with the workspace state",
  command: "axm sync",
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const makeFinding = (args: {
  readonly suffix: string;
  readonly severity: "info" | "warn" | "error";
  readonly message: string;
  readonly subject?: {
    readonly kind: "extension" | "agent" | "file" | "workspace";
    readonly ref: string;
  };
  readonly details?: string;
  readonly action?: Action;
}): Finding => ({
  id: `${CHECK_IDS.extensionsActive}.${args.suffix}`,
  severity: args.severity,
  message: args.message,
  ...(args.subject === undefined ? {} : { subject: args.subject }),
  ...(args.details === undefined ? {} : { details: args.details }),
  ...(args.action === undefined ? {} : { action: args.action }),
});

// ---------------------------------------------------------------------------
// Context preparation
// ---------------------------------------------------------------------------

const prepareContext = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const snapshot = yield* buildWorkspaceSkillSnapshot();

    // Precompute artifact basenames so diagnostics stay pure (no Path service).
    const artifactNames: Map<string, string> = new Map();
    for (const skill of snapshot.skills) {
      if (isResolvedWorkspaceSkill(skill)) {
        artifactNames.set(skill.name, path.basename(skill.canonicalPath));
      }
    }

    const agentDirScans = yield* Effect.forEach(
      snapshot.agents.supportedDirs,
      ({ agentId, dir }) =>
        Effect.gen(function* () {
          const dirExists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
          if (!dirExists) {
            return { agentId, dir, artifacts: [] } satisfies AgentDirScan;
          }

          const entries = yield* fs
            .readDirectory(dir)
            .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

          const artifacts = yield* Effect.forEach(
            entries,
            (name) =>
              Effect.gen(function* () {
                const fullPath = path.join(dir, name);
                // readLink succeeds only for symlinks (no lstat in Effect FileSystem)
                const linkTarget = yield* fs.readLink(fullPath).pipe(Effect.option);
                const isSymlink = Option.isSome(linkTarget);

                // For symlinks, check whether the target still exists (stat follows links)
                const targetExists = isSymlink
                  ? yield* fs.exists(fullPath).pipe(Effect.orElseSucceed(() => false))
                  : true;

                return {
                  name,
                  path: fullPath,
                  isSymlink,
                  targetExists,
                } satisfies AgentDirArtifact;
              }),
            { concurrency: "unbounded" },
          );

          return { agentId, dir, artifacts } satisfies AgentDirScan;
        }),
      { concurrency: "unbounded" },
    );

    return {
      snapshot,
      agentDirScans: [...agentDirScans].sort((left, right) =>
        left.agentId.localeCompare(right.agentId),
      ),
      artifactNames,
    } satisfies ExtensionsActiveContext;
  });

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

type ExtensionsActiveDiagnostic = DiagnosticDef<ExtensionsActiveContext, never>;

const enabledNotLinkedDiagnostic: ExtensionsActiveDiagnostic = {
  id: `${CHECK_IDS.extensionsActive}.enabled-not-linked`,
  run: (ctx) =>
    Effect.succeed(
      ctx.snapshot.skills
        .filter(isResolvedWorkspaceSkill)
        .filter((skill) => skill.enabled)
        .flatMap((skill) => {
          const expectedName = ctx.artifactNames.get(skill.name);
          if (expectedName === undefined) return [];
          return ctx.agentDirScans.flatMap((scan) => {
            const found = scan.artifacts.some((artifact) => artifact.name === expectedName);
            if (found) return [];
            return [
              makeFinding({
                suffix: "enabled-not-linked",
                severity: "error",
                message: `The skill "${skill.name}" is enabled but not linked in agent "${scan.agentId}" skill directory`,
                subject: { kind: "extension", ref: `skill:${skill.name}` },
                action: SYNC_ACTION,
              }),
            ];
          });
        })
        .sort((left, right) => left.message.localeCompare(right.message)),
    ),
};

const disabledStillPresentDiagnostic: ExtensionsActiveDiagnostic = {
  id: `${CHECK_IDS.extensionsActive}.disabled-still-present`,
  run: (ctx) =>
    Effect.succeed(
      ctx.snapshot.skills
        .filter(isResolvedWorkspaceSkill)
        .filter((skill) => !skill.enabled)
        .flatMap((skill) => {
          const expectedName = ctx.artifactNames.get(skill.name);
          if (expectedName === undefined) return [];
          return ctx.agentDirScans.flatMap((scan) => {
            const found = scan.artifacts.some((artifact) => artifact.name === expectedName);
            if (!found) return [];
            return [
              makeFinding({
                suffix: "disabled-still-present",
                severity: "error",
                message: `The skill "${skill.name}" is disabled but still present in agent "${scan.agentId}" skill directory`,
                subject: { kind: "extension", ref: `skill:${skill.name}` },
                action: SYNC_ACTION,
              }),
            ];
          });
        })
        .sort((left, right) => left.message.localeCompare(right.message)),
    ),
};

const brokenSymlinkDiagnostic: ExtensionsActiveDiagnostic = {
  id: `${CHECK_IDS.extensionsActive}.broken-symlink`,
  run: (ctx) =>
    Effect.succeed(
      ctx.agentDirScans
        .flatMap((scan) =>
          scan.artifacts
            .filter((artifact) => artifact.isSymlink && !artifact.targetExists)
            .map((artifact) =>
              makeFinding({
                suffix: "broken-symlink",
                severity: "error",
                message: `Broken symlink in agent "${scan.agentId}" skill directory: ${artifact.name}`,
                subject: { kind: "file", ref: artifact.path },
                action: SYNC_ACTION,
              }),
            ),
        )
        .sort((left, right) => left.message.localeCompare(right.message)),
    ),
};

const staleArtifactDiagnostic: ExtensionsActiveDiagnostic = {
  id: `${CHECK_IDS.extensionsActive}.stale-artifact`,
  run: (ctx) => {
    const expectedNames = new Set(ctx.artifactNames.values());

    return Effect.succeed(
      ctx.agentDirScans
        .flatMap((scan) =>
          scan.artifacts
            .filter((artifact) => !expectedNames.has(artifact.name))
            .map((artifact) =>
              makeFinding({
                suffix: "stale-artifact",
                severity: "warn",
                message: `Stale artifact in agent "${scan.agentId}" skill directory: ${artifact.name}`,
                subject: { kind: "file", ref: artifact.path },
                action: SYNC_ACTION,
              }),
            ),
        )
        .sort((left, right) => left.message.localeCompare(right.message)),
    );
  },
};

const nameMismatchDiagnostic: ExtensionsActiveDiagnostic = {
  id: `${CHECK_IDS.extensionsActive}.name-mismatch`,
  run: (ctx) =>
    Effect.succeed(
      ctx.snapshot.skills
        .filter(isResolvedWorkspaceSkill)
        .filter((skill) => skill.enabled)
        .flatMap((skill) => {
          const expectedName = ctx.artifactNames.get(skill.name);
          if (expectedName === undefined) return [];
          const sanitized = sanitizeName(skill.name);
          if (sanitized === expectedName) return [];
          return [
            makeFinding({
              suffix: "name-mismatch",
              severity: "warn",
              message: `The skill "${skill.name}" artifact name does not match the sanitized name convention`,
              subject: { kind: "extension", ref: `skill:${skill.name}` },
              action: SYNC_ACTION,
            }),
          ];
        })
        .sort((left, right) => left.message.localeCompare(right.message)),
    ),
};

const crossAgentInconsistentDiagnostic: ExtensionsActiveDiagnostic = {
  id: `${CHECK_IDS.extensionsActive}.cross-agent-inconsistent`,
  run: (ctx) => {
    if (ctx.agentDirScans.length < 2) return Effect.succeed([]);

    return Effect.succeed(
      ctx.snapshot.skills
        .filter(isResolvedWorkspaceSkill)
        .filter((skill) => skill.enabled)
        .flatMap((skill) => {
          const expectedName = ctx.artifactNames.get(skill.name);
          if (expectedName === undefined) return [];
          const present: Array<string> = [];
          const absent: Array<string> = [];

          for (const scan of ctx.agentDirScans) {
            const found = scan.artifacts.some((artifact) => artifact.name === expectedName);
            if (found) {
              present.push(scan.agentId);
            } else {
              absent.push(scan.agentId);
            }
          }

          if (present.length === 0 || absent.length === 0) return [];

          return [
            makeFinding({
              suffix: "cross-agent-inconsistent",
              severity: "warn",
              message: `The skill "${skill.name}" is linked for some agents but not all`,
              subject: { kind: "extension", ref: `skill:${skill.name}` },
              details: `Present: ${present.join(", ")}; Absent: ${absent.join(", ")}`,
              action: SYNC_ACTION,
            }),
          ];
        })
        .sort((left, right) => left.message.localeCompare(right.message)),
    );
  },
};

// ---------------------------------------------------------------------------
// Check definition
// ---------------------------------------------------------------------------

export const extensionsActiveCheck = defineCheck({
  id: CHECK_IDS.extensionsActive,
  title: "Extensions are active",
  description:
    "Verifies that enabled extensions are linked into agent skill directories and disabled ones are removed.",
  dependsOn: [CHECK_IDS.extensionsInstalled, CHECK_IDS.agentsConfigured],
  prepareContext: prepareContext(),
  diagnostics: [
    enabledNotLinkedDiagnostic,
    disabledStillPresentDiagnostic,
    brokenSymlinkDiagnostic,
    staleArtifactDiagnostic,
    nameMismatchDiagnostic,
    crossAgentInconsistentDiagnostic,
  ],
});
