import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";
import YAML from "yaml";

import { toAppError } from "../../../app-error/conversions.js";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";

import { Screen, rawDoc } from "../../../screen/index.js";
import { withArgvTracking } from "../../../cli-runtime/index.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";
import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "@agentxm/knowledge-query";
import { LockfileSchema } from "@agentxm/workspace-state";
import { SettingsSchema } from "@agentxm/workspace-state";
import {
  resolveProjectWorkspaceStatePaths,
  resolveUserHome,
  resolveUserWorkspaceLayout,
  WorkspaceMutations,
} from "@agentxm/workspace-state";
import { type WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

import { ExecutionDirectory } from "../../../execution-directory.js";
import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { captureInstalledKnowledgeIndex } from "../inspect.js";
import { KnowledgeConceptStatusOutputSchema } from "./schemas.js";

const selectedKnowledgeNames = Effect.gen(function* () {
  const workspace = yield* WorkspaceMutations;
  const graph = yield* workspace.getDesiredStateGraph();
  const locked = yield* workspace.getLockedKnowledge();
  return new Set(
    graph.nodes.flatMap((node) =>
      node.type === "knowledge" && locked[node.name] !== undefined ? [node.name] : [],
    ),
  );
});

const crossScopeCollisions = Effect.gen(function* () {
  const workspace = yield* WorkspaceMutations;
  const executionDirectory = yield* ExecutionDirectory;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const checkedScope: WorkspaceScope = workspace.scope === "project" ? "user" : "project";
  const otherPaths =
    checkedScope === "user"
      ? yield* resolveUserWorkspaceLayout(yield* resolveUserHome())
      : resolveProjectWorkspaceStatePaths(path, executionDirectory.path);
  const settingsResult = yield* Effect.result(fs.readFileString(otherPaths.settingsPath));
  const lockfileResult = yield* Effect.result(fs.readFileString(otherPaths.lockPath));
  if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
    return { checkedScope, state: "not-determined" as const, bundleNames: [] };
  }
  const decoded = yield* Effect.try({
    try: () => ({
      settings: Schema.decodeUnknownResult(SettingsSchema)(JSON.parse(settingsResult.success)),
      lockfile: Schema.decodeUnknownResult(LockfileSchema)(YAML.parse(lockfileResult.success)),
    }),
    catch: () => undefined,
  }).pipe(Effect.catch(() => Effect.succeed(undefined)));
  if (
    decoded === undefined ||
    Result.isFailure(decoded.settings) ||
    Result.isFailure(decoded.lockfile)
  ) {
    return { checkedScope, state: "not-determined" as const, bundleNames: [] };
  }
  const current = yield* selectedKnowledgeNames;
  const configured = new Set(Object.keys(decoded.settings.success.knowledge ?? {}));
  const locked = new Set(Object.keys(decoded.lockfile.success.knowledge ?? {}));
  const bundleNames = [...current]
    .filter((name) => configured.has(name) && locked.has(name))
    .sort((left, right) => left.localeCompare(right));
  return { checkedScope, state: "determined" as const, bundleNames };
});

export const handleKnowledgeConceptStatus = Effect.fn("Knowledge.concepts.status")(function* () {
  const screen = yield* Screen;
  const capturedResult = yield* Effect.result(captureInstalledKnowledgeIndex());
  const scopeCollisions = yield* crossScopeCollisions;
  const output =
    Result.isSuccess(capturedResult) && capturedResult.success.outcome === "ready"
      ? {
          capabilities: KNOWLEDGE_DISCOVERY_CAPABILITIES,
          readiness: "ready" as const,
          health: { status: "healthy" as const, diagnostics: [] },
          corpusFingerprint: capturedResult.success.snapshot.fingerprint,
          bundleCount: capturedResult.success.bundles.length,
          conceptCount: capturedResult.success.snapshot.concepts.length,
          scopeCollisions,
        }
      : {
          capabilities: KNOWLEDGE_DISCOVERY_CAPABILITIES,
          readiness: Result.isFailure(capturedResult)
            ? ("unavailable" as const)
            : ("changing" as const),
          health: {
            status: "unhealthy" as const,
            diagnostics: [
              Result.isFailure(capturedResult)
                ? `${toAppError(capturedResult.failure).detail} Correct the source problem and retry.`
                : "The installed Knowledge corpus kept changing during capture. Retry after updates finish.",
            ],
          },
          bundleCount: 0,
          conceptCount: 0,
          scopeCollisions,
        };
  if (yield* screen.document(output, KnowledgeConceptStatusOutputSchema)) return;
  yield* screen.result(
    rawDoc(
      `Knowledge discovery ${output.capabilities.version}\nStatus   ${output.readiness}\nBundles  ${String(output.bundleCount)}\nConcepts ${String(output.conceptCount)}\n${output.corpusFingerprint === undefined ? "" : `Corpus   ${output.corpusFingerprint}\n`}${output.health.diagnostics.map((diagnostic) => `${sanitizeKnowledgeTerminalText(diagnostic)}\n`).join("")}`,
    ),
  );
});

const statusConfig = { ...scopeConfig } as const;

export const statusCommand = Command.make("status", statusConfig, ({ scope }) =>
  handleKnowledgeConceptStatus().pipe(
    withWorkspace(scope),
    withRuntime("knowledge concepts status"),
  ),
).pipe(
  withArgvTracking(statusConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Report discovery capabilities and selected corpus identity"),
  Command.withExamples([
    {
      command: "axm knowledge concepts status",
      description: "Inspect the discovery contract and selected corpus fingerprint",
    },
  ]),
);
