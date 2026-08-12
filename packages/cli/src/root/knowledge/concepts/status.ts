import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Command } from "effect/unstable/cli";
import YAML from "yaml";

import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { KNOWLEDGE_DISCOVERY_CAPABILITIES } from "@agentxm/client-core/unstable/knowledge";
import { LockfileSchema, LOCKFILE_NAME } from "@agentxm/client-core/unstable/lockfile";
import { SettingsSchema, SETTINGS_FILENAME } from "@agentxm/client-core/unstable/settings";
import {
  resolveUserScopeDir,
  type WorkspaceScope,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";

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
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const checkedScope: WorkspaceScope = workspace.scope === "project" ? "user" : "project";
  const otherAxmDir =
    checkedScope === "user"
      ? yield* resolveUserScopeDir()
      : path.join(yield* Effect.sync(() => process.cwd()), ".axm");
  const settingsResult = yield* Effect.result(
    fs.readFileString(path.join(otherAxmDir, SETTINGS_FILENAME)),
  );
  const lockfileResult = yield* Effect.result(
    fs.readFileString(path.join(otherAxmDir, LOCKFILE_NAME)),
  );
  if (Result.isFailure(settingsResult) || Result.isFailure(lockfileResult)) {
    return { checkedScope, state: "not-determined" as const, bundleNames: [] };
  }
  const decoded = yield* Effect.try({
    try: () => ({
      settings: Schema.decodeUnknownResult(SettingsSchema)(JSON.parse(settingsResult.success)),
      lockfile: Schema.decodeUnknownResult(LockfileSchema)(YAML.parse(lockfileResult.success)),
    }),
    catch: () => undefined,
  });
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
}).pipe(
  Effect.catchCause(() =>
    Effect.map(WorkspaceMutations, (workspace) => ({
      checkedScope: workspace.scope === "project" ? ("user" as const) : ("project" as const),
      state: "not-determined" as const,
      bundleNames: [],
    })),
  ),
);

export const handleKnowledgeConceptStatus = Effect.fn("Knowledge.concepts.status")(function* () {
  const renderer = yield* CliRenderer;
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
          readiness: "changing" as const,
          health: {
            status: "unhealthy" as const,
            diagnostics: ["The installed Knowledge corpus kept changing during capture."],
          },
          bundleCount: 0,
          conceptCount: 0,
          scopeCollisions,
        };
  if (yield* renderer.result(output, KnowledgeConceptStatusOutputSchema)) return;
  yield* renderer.raw(
    `Knowledge discovery ${output.capabilities.version}\nStatus   ${output.readiness}\nBundles  ${String(output.bundleCount)}\nConcepts ${String(output.conceptCount)}\n${output.corpusFingerprint === undefined ? "" : `Corpus   ${output.corpusFingerprint}\n`}`,
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
  Command.withDescription("Report discovery capabilities and selected corpus identity"),
  Command.withExamples([
    {
      command: "axm knowledge concepts status",
      description: "Inspect the discovery contract and selected corpus fingerprint",
    },
  ]),
);
