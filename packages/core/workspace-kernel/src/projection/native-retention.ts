/** Ephemeral owner-unit evidence for content a transition promises to leave in place. */
import { sha512Integrity } from "@agentxm/host-primitives";
import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  commentStyleForTarget,
  inspectManagedRegion,
  parseNativeConfigRoot,
  type RegionName,
} from "../agent-adapters/index.js";
import {
  COPIED_DIRECTORY_RECEIPT,
  nativeUnitKey,
  readCopiedDirectory,
  resolveNativeReadLocation,
  resolveNativeEntry,
  type NativeDirectoryInputs,
  type NativeLocationOutcome,
} from "../locations/index.js";
import { computeSourceHash } from "../workspace-state/index.js";
import { ProjectionIoFailed } from "./errors.js";

/** Memory-only fingerprints; these are neither currency nor deletion authority. */
export interface NativeRetentionWitness {
  readonly location: NativeLocationOutcome;
  readonly fingerprint: string;
}

export interface NativeRetentionContext {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
};

const isRegionName = (region: string): region is RegionName =>
  region === "rules" ||
  region === "knowledge" ||
  region === "hook-fallbacks" ||
  region === "instruction-aliases" ||
  region.startsWith("mcp-server:");

/** The same owner-declared aliases select the grammar used by native writers. */
const keyContent = (
  unit: NativeLocationOutcome,
  raw: string,
  path: Path.Path,
  context: NativeRetentionContext,
) =>
  Effect.gen(function* () {
    if (unit.address.kind !== "key-path") return undefined;
    const aliases = new Set([...unit.aliases, unit.address.path]);
    const declarations = AGENTS.flatMap((agent) => {
      const mcp = agent.capabilities["mcp-server"].native;
      const hook = agent.capabilities.hook.native;
      return [
        ...("locations" in mcp ? mcp.locations : []),
        ...("locations" in hook ? hook.locations : []),
      ].map((declaration) => ({ agentId: agent.id, declaration }));
    });
    const formats = new Set(
      declarations
        .filter(({ agentId, declaration }) => {
          if (!unit.configuredConsumers.includes(agentId)) return false;
          const resolved = resolveNativeReadLocation(
            path,
            agentId,
            declaration,
            { workspaceRoot: context.workspaceRoot, scope: unit.scope },
            context.nativeDirectoryInputs,
          );
          return resolved !== undefined && aliases.has(resolved.path);
        })
        .map(({ declaration }) => declaration.format),
    );
    if (formats.size === 0)
      return yield* new ProjectionIoFailed({
        path: unit.address.path,
        step: "inspect",
        cause: "native-unit-grammar-unavailable",
      });
    const contents: string[] = [];
    for (const format of formats) {
      let value: unknown = yield* parseNativeConfigRoot({
        format,
        configPath: unit.address.path,
        raw,
      });
      for (const key of unit.address.keys) {
        if (typeof value !== "object" || value === null || Array.isArray(value))
          return yield* new ProjectionIoFailed({
            path: unit.address.path,
            step: "inspect",
            cause: "native-unit-key-unavailable",
          });
        value = Object.entries(value).find(([name]) => name === key)?.[1];
      }
      if (value === undefined)
        return yield* new ProjectionIoFailed({
          path: unit.address.path,
          step: "inspect",
          cause: "native-unit-key-unavailable",
        });
      contents.push(JSON.stringify(stableValue(value)));
    }
    return [...new Set(contents)].sort();
  });

const observeRetention = (unit: NativeLocationOutcome, context: NativeRetentionContext) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const address = yield* resolveNativeEntry(unit.address.path);
    if (address.kind === "absent" || address.referentPath === undefined)
      return yield* new ProjectionIoFailed({
        path: unit.address.path,
        step: "inspect",
        cause: "retained-native-unit-unavailable",
      });
    const aliases = yield* Effect.forEach([...new Set(unit.aliases)].sort(), (alias) =>
      resolveNativeEntry(alias).pipe(
        Effect.map((entry) => [alias, entry.entryPath, entry.referentPath, entry.linkTarget]),
      ),
    );
    let content: unknown;
    if (unit.address.kind === "key-path") {
      content = yield* keyContent(
        unit,
        yield* fs.readFileString(address.referentPath),
        path,
        context,
      );
    } else if (unit.address.kind === "region") {
      const style = commentStyleForTarget(unit.address.path);
      if (Option.isNone(style) || !isRegionName(unit.address.region))
        return yield* new ProjectionIoFailed({
          path: unit.address.path,
          step: "inspect",
          cause: "retained-region-grammar-unavailable",
        });
      const raw = yield* fs.readFileString(address.referentPath);
      const region = inspectManagedRegion(raw, unit.address.region, style.value);
      if (region.state !== "complete")
        return yield* new ProjectionIoFailed({
          path: unit.address.path,
          step: "inspect",
          cause: "retained-region-unavailable",
        });
      // Keep exact line endings inside this unit, excluding unrelated sibling regions.
      content = raw
        .split(/(?<=\n)/u)
        .slice(region.start, region.end + 1)
        .join("")
        .replace(/\r?\n$/u, "");
    } else if (
      unit.policyReasons.includes("instruction-propagation") &&
      (address.kind === "symlink" || unit.proof === "canonical-source-coincidence")
    ) {
      // Instruction routing owns the alias or source location. Rules and
      // Knowledge own their selected regions in its content independently.
      content = [address.kind, address.linkTarget];
    } else if (
      address.kind === "directory" ||
      (yield* fs.stat(address.referentPath)).type === "Directory"
    ) {
      const receipt = yield* readCopiedDirectory(address.entryPath);
      const files = Option.isSome(receipt)
        ? [COPIED_DIRECTORY_RECEIPT, ...receipt.value.files.map((file) => file.path)]
        : yield* fs.readDirectory(address.referentPath, { recursive: true });
      content = yield* Effect.forEach([...files].sort(), (relative) =>
        Effect.gen(function* () {
          const target = path.join(address.referentPath ?? address.entryPath, relative);
          const link = yield* fs.readLink(target).pipe(Effect.option);
          if (Option.isSome(link)) return [relative, "link", link.value];
          const info = yield* fs.stat(target);
          return info.type === "Directory"
            ? [relative, "directory"]
            : [relative, "file", sha512Integrity(yield* fs.readFile(target))];
        }),
      );
    } else content = sha512Integrity(yield* fs.readFile(address.referentPath));
    // Shared-file siblings may legitimately replace the containing file. Whole
    // entries promised unchanged also retain their observed entry identity.
    const identity =
      (unit.address.kind === "file" || unit.address.kind === "entry") &&
      !unit.policyReasons.includes("instruction-propagation")
        ? [address.kind, address.device, address.inode]
        : undefined;
    return computeSourceHash(
      JSON.stringify([
        address.entryPath,
        address.referentPath,
        address.linkTarget,
        identity,
        aliases,
        content,
      ]),
    );
  }).pipe(
    Effect.mapError(
      (cause) => new ProjectionIoFailed({ path: unit.address.path, step: "inspect", cause }),
    ),
  );

/** Capture only units the plan promises to retain without rewriting. */
export const captureNativeRetentionWitnesses = (
  locations: ReadonlyArray<NativeLocationOutcome>,
  context: NativeRetentionContext,
) =>
  Effect.forEach(
    [
      ...new Map(
        locations
          .filter(
            (unit) =>
              unit.ownership === "owned" &&
              (unit.configuredConsumers.length > 0 || unit.policyReasons.length > 0) &&
              (unit.state === "retained" || unit.state === "unchanged"),
          )
          .map((unit) => [nativeUnitKey(unit), unit]),
      ).values(),
    ],
    (location) =>
      observeRetention(location, context).pipe(
        Effect.map((fingerprint): NativeRetentionWitness => ({ location, fingerprint })),
      ),
  );

export const validateNativeRetentionWitnesses = (
  witnesses: ReadonlyArray<NativeRetentionWitness>,
  context: NativeRetentionContext,
) =>
  Effect.forEach(
    witnesses,
    (witness) =>
      Effect.gen(function* () {
        if ((yield* observeRetention(witness.location, context)) !== witness.fingerprint)
          return yield* new ProjectionIoFailed({
            path: witness.location.address.path,
            step: "inspect",
            cause: "retained-native-unit-changed",
          });
      }),
    { discard: true },
  );
