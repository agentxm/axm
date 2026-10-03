import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  loadSubagentPackage,
  nativeSubagentFormat,
  parseNativeSubagent,
} from "@agentxm/extension-content";
import {
  CONFIGURABLE_AGENT_IDS,
  type AgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type { ExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";
import { MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { copyExtensionDirectory } from "@agentxm/workspace-kernel/acquisition";

import {
  NativeImportConflict,
  NativeImportFailed,
  NativeImportInvalid,
  NativeSubagentImportUnsupported,
  NativeSubagentRuntimeRequired,
} from "./authored-package-errors.js";

/** Native import is explicit when a Markdown document has no unique runtime location. */
export const importNativeSubagent = Effect.fn("ImportNativeSubagent")(function* (args: {
  readonly sourcePath: string;
  readonly targetDir: string;
  readonly target: ExtensionFqnParts;
  readonly sourceAgent?: AgentId;
  readonly existingPackagePath?: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ioFailure = (cause: unknown) =>
    new NativeImportFailed({ detail: "Native subagent import failed", cause });
  const stat = yield* fs.stat(args.sourcePath).pipe(Effect.mapError(ioFailure));
  let sourceFile = args.sourcePath;
  if (stat.type === "Directory") {
    const entries = yield* fs.readDirectory(sourceFile).pipe(Effect.mapError(ioFailure));
    const candidates = entries.filter(
      (entry) => /\.(md|toml|json)$/i.test(entry) && !/^readme\.md$/i.test(entry),
    );
    if (candidates.length !== 1 || candidates[0] === undefined) {
      return yield* new NativeImportInvalid({
        detail:
          "Native subagent import requires exactly one definition file; select a file explicitly",
      });
    }
    sourceFile = path.join(sourceFile, candidates[0]);
  } else if (stat.type !== "File") {
    return yield* new NativeImportInvalid({
      detail: "Native subagent source must be a file or directory",
    });
  }
  const normalized = sourceFile.replaceAll("\\", "/");
  const locationAgents = CONFIGURABLE_AGENT_IDS.filter((id) =>
    AGENT_DESCRIPTORS[id].subagents?.locations.some(
      (location) =>
        location.status === "canonical" &&
        location.applicability.kind === "always" &&
        (location.shape === "directory"
          ? normalized.includes(`/${location.path}/`)
          : normalized.endsWith(`/${location.path}`)),
    ),
  );
  const inferred = locationAgents.length === 1 ? locationAgents[0] : undefined;
  if (
    args.sourceAgent !== undefined &&
    locationAgents.length > 0 &&
    !locationAgents.some((id) => id === args.sourceAgent)
  ) {
    return yield* new NativeImportInvalid({
      detail: `Source runtime ${args.sourceAgent} contradicts the native ${locationAgents.join(", ")} source`,
    });
  }
  const agentId = args.sourceAgent ?? inferred;
  if (agentId === undefined) {
    return yield* new NativeSubagentRuntimeRequired({ sourcePath: sourceFile });
  }
  if (nativeSubagentFormat(agentId) === undefined)
    return yield* new NativeSubagentImportUnsupported({ agentId });
  const content = yield* fs.readFileString(sourceFile).pipe(Effect.mapError(ioFailure));
  const native = yield* parseNativeSubagent({ agentId, source: sourceFile, content }).pipe(
    Effect.mapError((cause) => new NativeImportInvalid({ detail: cause.detail, cause })),
  );
  const existing =
    args.existingPackagePath === undefined
      ? undefined
      : yield* loadSubagentPackage(args.existingPackagePath).pipe(
          Effect.mapError((cause) => new NativeImportInvalid({ detail: cause.detail, cause })),
        );
  if (
    existing !== undefined &&
    (existing.manifest.owner !== args.target.owner || existing.manifest.name !== args.target.name)
  ) {
    return yield* new NativeImportConflict({
      targetDir: args.existingPackagePath ?? args.targetDir,
    });
  }
  if (existing?.manifest.implementations?.[agentId] !== undefined) {
    return yield* new NativeImportConflict({
      targetDir: `${args.existingPackagePath ?? args.targetDir}#implementations.${agentId}`,
    });
  }
  if (args.existingPackagePath !== undefined) {
    yield* copyExtensionDirectory(args.existingPackagePath, args.targetDir).pipe(
      Effect.mapError(ioFailure),
    );
  }
  const relativeSource = `native/${agentId}/${path.basename(sourceFile)}`;
  const destination = path.join(args.targetDir, relativeSource);
  if (yield* fs.exists(destination).pipe(Effect.mapError(ioFailure))) {
    return yield* new NativeImportConflict({ targetDir: destination });
  }
  yield* fs
    .makeDirectory(path.dirname(destination), { recursive: true })
    .pipe(Effect.mapError(ioFailure));
  yield* fs.writeFileString(destination, content).pipe(Effect.mapError(ioFailure));
  const manifest = {
    ...(existing?.manifest ?? {
      $schema: MANIFEST_SCHEMA_URL,
      owner: args.target.owner,
      type: "subagent",
      name: args.target.name,
      version: "0.1.0",
      ...(native.description === undefined ? {} : { description: native.description }),
    }),
    implementations: {
      ...existing?.manifest.implementations,
      [agentId]: { kind: "native", source: relativeSource },
    },
  };
  yield* fs
    .writeFileString(
      path.join(args.targetDir, "subagent.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )
    .pipe(Effect.mapError(ioFailure));
  yield* loadSubagentPackage(args.targetDir).pipe(
    Effect.mapError((cause) => new NativeImportInvalid({ detail: cause.detail, cause })),
  );
});
