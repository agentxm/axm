/** Ephemeral owner-unit evidence for content a transition promises to leave in place. */
import { sha512Integrity } from "@agentxm/host-primitives";
import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { parseNativeConfigRoot } from "../agent-adapters/index.js";
import {
  COPIED_DIRECTORY_RECEIPT,
  nativeUnitKey,
  readCopiedDirectory,
  resolveNativeReadLocation,
  captureNativeLocationSet,
  type NativeLocationSet,
  type NativeDirectoryInputs,
  type NativeLocationOutcome,
} from "../locations/index.js";
import { computeSourceHash } from "../workspace-state/index.js";
import { ProjectionIoFailed } from "./errors.js";
import { nativeManagedRegionContent } from "./native-managed-region.js";

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

const observeRetention = (
  unit: NativeLocationOutcome,
  context: NativeRetentionContext,
  locations: NativeLocationSet,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const address = yield* locations.entry(unit.address.path);
    if (address.kind === "absent" || address.referentPath === undefined)
      return yield* new ProjectionIoFailed({
        path: unit.address.path,
        step: "inspect",
        cause: "retained-native-unit-unavailable",
      });
    const aliases = yield* Effect.forEach([...new Set(unit.aliases)].sort(), (alias) =>
      locations
        .entry(alias)
        .pipe(
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
      content = yield* nativeManagedRegionContent({
        targetPath: unit.address.path,
        region: unit.address.region,
        raw: yield* fs.readFileString(address.referentPath),
      });
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
  Effect.gen(function* () {
    const required = [
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
    ];
    const observed = yield* captureNativeLocationSet({
      entries: required.flatMap((unit) => [unit.address.path, ...unit.aliases]),
    });
    return yield* Effect.forEach(required, (location) =>
      observeRetention(location, context, observed).pipe(
        Effect.map((fingerprint): NativeRetentionWitness => ({ location, fingerprint })),
      ),
    );
  });

export const validateNativeRetentionWitnesses = (
  witnesses: ReadonlyArray<NativeRetentionWitness>,
  context: NativeRetentionContext,
) =>
  Effect.gen(function* () {
    // Capture a fresh set after mutation; no physical evidence crosses phases.
    const observed = yield* captureNativeLocationSet({
      entries: witnesses.flatMap(({ location }) => [location.address.path, ...location.aliases]),
    });
    yield* Effect.forEach(
      witnesses,
      (witness) =>
        Effect.gen(function* () {
          if (
            (yield* observeRetention(witness.location, context, observed)) !== witness.fingerprint
          )
            return yield* new ProjectionIoFailed({
              path: witness.location.address.path,
              step: "inspect",
              cause: "retained-native-unit-changed",
            });
        }),
      { discard: true },
    );
  });
