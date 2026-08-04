import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, type DetailView } from "@agentxm/client-core/unstable/cli-renderer";
import {
  computePackageContentHash,
  formatFqn,
  parseExtensionFqnParts,
} from "@agentxm/client-core/unstable/extensions";
import {
  computePackPaths,
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
  packTrustManifest,
} from "@agentxm/client-core/unstable/packs";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { trustRecordKey } from "@agentxm/client-core/unstable/trust";
import {
  DEFAULT_WORKSPACE_SCOPE,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const PackRepairResultSchema = Schema.Struct({
  pack: Schema.String,
  authority: Schema.Literal("workspace"),
  canonicalPath: Schema.String,
  previousContentIdentity: Schema.NullOr(Schema.String),
  currentContentIdentity: Schema.String,
  changes: Schema.Array(
    Schema.Struct({
      classification: Schema.Literals(["version", "dependencies", "metadata", "content"]),
      fields: Schema.Array(Schema.String),
    }),
  ),
  confirmation: Schema.Literals(["none", "accept-current"]),
  result: Schema.Literals(["current", "previewed", "requires-confirmation", "repaired"]),
  recoveryAction: Schema.NullOr(Schema.String),
});

type PackRepairResult = Schema.Schema.Type<typeof PackRepairResultSchema>;

const RepairDetail = {
  fields: {
    pack: { label: "Pack" },
    authority: { label: "Authority" },
    canonicalPath: { label: "Canonical path" },
    changes: {
      label: "Changes",
      render: (changes) =>
        changes.length === 0
          ? "none"
          : changes
              .map((change) => `${change.classification}: ${change.fields.join(", ")}`)
              .join("; "),
    },
    confirmation: { label: "Confirmation" },
    result: { label: "Result" },
    recoveryAction: {
      label: "Recovery",
      render: (value) => value ?? "none",
    },
  },
} as const satisfies DetailView<
  Pick<
    PackRepairResult,
    | "pack"
    | "authority"
    | "canonicalPath"
    | "changes"
    | "confirmation"
    | "result"
    | "recoveryAction"
  >
>;

const changedDependencyFields = (
  previous: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
): ReadonlyArray<string> => {
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort();
  return keys.filter((key) => previous[key] !== current[key]);
};

const configuredSource = (entry: string | { readonly source: string }): string =>
  typeof entry === "string" ? entry : entry.source;

export const handlePacksRepair = Effect.fn("PacksRepair.handle")(function* (args: {
  readonly target: string;
  readonly acceptCurrent: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;
  const requested = parseExtensionFqnParts(args.target);
  if (requested !== undefined && requested.type !== "pack") {
    return yield* makeAppError({
      code: "validation",
      detail: `Expected a pack identity, received ${args.target}`,
    });
  }
  const name = requested?.name ?? args.target;
  const entries = yield* ws.getConfiguredPackEntries();
  const entry = entries[name];
  if (entry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Configured pack "${name}" was not found`,
    });
  }
  const source = configuredSource(entry);
  if (!isWorkspaceSourceLocator(source)) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Pack "${name}" is not workspace-authored`,
    });
  }
  const sourceIdentity = source.slice("workspace:".length);
  const parsedSource = parseExtensionFqnParts(sourceIdentity);
  if (parsedSource === undefined || parsedSource.type !== "pack" || parsedSource.name !== name) {
    return yield* makeAppError({
      code: "validation",
      detail: `Workspace pack source identity is malformed or mismatched: ${source}`,
    });
  }
  if (
    requested !== undefined &&
    (requested.owner !== parsedSource.owner || requested.name !== parsedSource.name)
  ) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Requested identity ${args.target} does not match configured authority ${sourceIdentity}`,
    });
  }

  const packPath = computePackPaths(path.join, ws.baseDir, parsedSource.owner, name).canonicalPath;
  const manifestPath = path.join(packPath, PACK_MANIFEST_FILENAME);
  const manifestText = yield* fs.readFileString(manifestPath).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "not_found",
        detail: `Pack manifest is unavailable at ${manifestPath}`,
        cause,
      }),
    ),
  );
  const manifestJson = yield* Effect.try({
    try: (): unknown => JSON.parse(manifestText),
    catch: (cause) =>
      makeAppError({
        code: "validation",
        detail: `Pack manifest is malformed at ${manifestPath}`,
        cause,
      }),
  });
  const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(manifestJson).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Pack manifest is invalid at ${manifestPath}`,
        cause,
      }),
    ),
  );
  if (
    manifest.owner !== parsedSource.owner ||
    manifest.name !== parsedSource.name ||
    manifest.type !== "pack"
  ) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Pack manifest identity does not match configured workspace authority ${sourceIdentity}`,
    });
  }

  const trust = yield* ws.getTrustState();
  const record = trust.records[trustRecordKey("pack", name)];
  const expectedIdentity = `workspace:${sourceIdentity}`;
  if (record?.authority !== "workspace" || record.sourceIdentity !== expectedIdentity) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Pack trust authority does not match configured workspace authority ${expectedIdentity}`,
    });
  }

  const currentContentIdentity = yield* computePackageContentHash(packPath);
  const snapshot = packTrustManifest(manifest);
  const changes: Array<PackRepairResult["changes"][number]> = [];
  const previous = record.packManifest;
  const previousVersion = previous?.version ?? record.resolvedVersion;
  if (previousVersion !== undefined && previousVersion !== manifest.version) {
    changes.push({ classification: "version", fields: ["version"] });
  }
  if (previous !== undefined) {
    const dependencyFields = changedDependencyFields(previous.dependencies, manifest.dependencies);
    if (dependencyFields.length > 0) {
      changes.push({ classification: "dependencies", fields: dependencyFields });
    }
    if (previous.metadataIdentity !== snapshot.metadataIdentity) {
      changes.push({ classification: "metadata", fields: ["description/keywords/metadata"] });
    }
  }
  if (
    record.contentIdentity !== currentContentIdentity &&
    (previous === undefined || changes.length === 0)
  ) {
    changes.push({ classification: "content", fields: ["package content"] });
  }

  const fqn = formatFqn({
    owner: parsedSource.owner,
    type: "pack",
    name: parsedSource.name,
  });
  const current = record.contentIdentity === currentContentIdentity && changes.length === 0;
  const shouldApply = !current && args.acceptCurrent && !args.preview;
  if (shouldApply) {
    yield* ws.refreshPackContentIdentity(name, currentContentIdentity, snapshot);
  }
  const result: PackRepairResult = {
    pack: fqn,
    authority: "workspace",
    canonicalPath: manifestPath,
    previousContentIdentity: record.contentIdentity ?? null,
    currentContentIdentity,
    changes,
    confirmation: current ? "none" : "accept-current",
    result: current
      ? "current"
      : shouldApply
        ? "repaired"
        : args.preview
          ? "previewed"
          : "requires-confirmation",
    recoveryAction: current || shouldApply ? null : `axm packs repair ${fqn} --accept-current`,
  };
  if (yield* renderer.result(result, PackRepairResultSchema)) return;
  yield* renderer.detail(
    {
      pack: result.pack,
      authority: result.authority,
      canonicalPath: result.canonicalPath,
      changes: result.changes,
      confirmation: result.confirmation,
      result: result.result,
      recoveryAction: result.recoveryAction,
    },
    RepairDetail,
    "Pack repair",
  );
});

const repairConfig = {
  target: Argument.string("name-or-fqn").pipe(
    Argument.withDescription("Configured workspace pack name or fully qualified identity"),
  ),
  acceptCurrent: Flag.boolean("accept-current").pipe(
    Flag.withDescription("Accept current canonical content as the new trusted baseline"),
  ),
  preview: Flag.boolean("preview").pipe(
    Flag.withDescription("Show the repair classification without changing workspace state"),
  ),
} as const;

export const repairCommand = Command.make(
  "repair",
  repairConfig,
  ({ target, acceptCurrent, preview }) =>
    handlePacksRepair({ target, acceptCurrent, preview }).pipe(
      withWorkspace(DEFAULT_WORKSPACE_SCOPE),
      withRuntime("packs repair"),
    ),
).pipe(
  withArgvTracking(repairConfig),
  Command.withDescription("Inspect or accept drift in a workspace-authored pack"),
  Command.withExamples([
    {
      command: "axm packs repair my-pack --preview",
      description: "Classify current pack drift without writing",
    },
    {
      command: "axm packs repair @acme/packs/my-pack --accept-current",
      description: "Accept current authored pack content",
    },
  ]),
);
