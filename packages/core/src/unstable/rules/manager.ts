/**
 * Rule manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { trustedRegistryVersionForRef, validateRefTrustTransition } from "../trust/index.js";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import { resolveInstructionsConfig } from "../agents/instructions.js";
import { makeAppError } from "../app-error/index.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  enabledConfiguredEntries,
  markerFqnForRef,
  materializeExternalPackage,
  materializeRegistryPackage,
} from "../extensions/index.js";
import { parseFrontmatterEffect } from "../extensions/frontmatter.js";
import { computePackageContentHash } from "../extensions/package-hash.js";
import { computeSourceHash, type SourceHash } from "../extensions/rendered-files.js";
import type { MaterializedFileTarget, RuleLockEntry } from "../lockfile/index.js";
import { MaterializedFileTargetSchema, validateExactResolvedVersion } from "../lockfile/index.js";
import { commonLockFields, gitSourceLockFields } from "../lockfile/entry-fields.js";
import {
  commentStyleForTarget,
  replaceManagedRegion,
  stripManagedRegion,
} from "../managed-files/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { makeWorkspaceRelativeSourcePath } from "../utils/index.js";
import { makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import type { ExtensionManager, ExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { resolveConfiguredRule } from "../workspace/configured-entry-resolution/index.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { trustedCanonicalObservation } from "../workspace/trusted-canonical-ref.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import {
  RULE_BODY_FILENAME,
  RULE_EXTENSION_DIR,
  RULE_MANIFEST_FILENAME,
  RuleManifestSchema,
  type GitHostedRuleRef,
  type LocalRuleRef,
  type RegistryRuleRef,
  type RuleExtensionRef,
  type RuleManifest,
  type WorkspaceRuleRef,
} from "./index.js";

export class RuleManager extends ServiceMap.Service<
  RuleManager,
  ExtensionManager<RuleExtensionRef>
>()("@agentxm/client-core/unstable/rules/manager/RuleManager") {}

const RULES_REGION = "rules";

const decodeRuleManifest = Schema.decodeUnknownEffect(RuleManifestSchema);
const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

const optionalSourceHash = (
  sourceHash: SourceHash | undefined,
): { readonly sourceHash?: SourceHash } => (sourceHash === undefined ? {} : { sourceHash });

const registryRuleLockEntry = (
  ref: RegistryRuleRef,
  now: DateTime.Utc,
  sourceHash: SourceHash | undefined,
): RuleLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const gitRuleLockEntry = (
  ref: GitHostedRuleRef,
  now: DateTime.Utc,
  sourceHash: SourceHash | undefined,
): RuleLockEntry => ({
  ...gitSourceLockFields(ref.source, ref.gitTreeSha),
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const localRuleLockEntry = (
  ref: LocalRuleRef,
  now: DateTime.Utc,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  sourceHash: SourceHash | undefined,
): RuleLockEntry => ({
  type: "local",
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const workspaceRuleLockEntry = (ref: WorkspaceRuleRef, now: DateTime.Utc): RuleLockEntry => ({
  type: "workspace",
  owner: ref.owner,
  extensionType: "rule",
  name: ref.name,
  version: ref.version,
  sourceHash: ref.sourceHash,
  ...commonLockFields(now),
});

const normalizeMarkdown = (content: string): string =>
  content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

export const RuleManagerLive = Layer.effect(
  RuleManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const baseDir = ws.baseDir;

    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const envLayer = Layer.mergeAll(
      fsPathLayer,
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(SourceHostProviders, sources),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const lastInstallState = new Map<
      string,
      {
        readonly ref: RuleExtensionRef;
        readonly materializedTargets: ReadonlyArray<MaterializedFileTarget>;
        readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
        readonly sourceHash: SourceHash;
      }
    >();

    const materializeFromRegistry = (ref: RegistryRuleRef, force: boolean) =>
      Effect.gen(function* () {
        const lockedVersion = trustedRegistryVersionForRef(yield* ws.getTrustState(), ref);
        return yield* provide(
          materializeRegistryPackage({
            baseDir,
            canonicalPath: path.join(
              baseDir,
              REGISTRY_EXTENSIONS_DIR,
              ref.owner,
              RULE_EXTENSION_DIR,
              ref.name,
            ),
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "rule",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
            force,
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            messages: {
              existsFailureDetail: (canonicalPath) =>
                `Failed to check if canonical rule package path exists: ${canonicalPath}`,
              integrityMismatchCode: "network",
              integrityMismatchDetail: `Integrity mismatch for rule:${ref.name}@${ref.version}`,
              tempDirectoryFailureDetail:
                "Temporary directory for registry rule install could not be created",
              createDirectoryFailureDetail: (canonicalPath) =>
                `Failed to create registry rule directory: ${canonicalPath}`,
              inspectExtractedFailureDetail: "Failed to inspect extracted registry rule package",
              copyEntryFailureCode: "internal",
              copyEntryFailureDetail: (entry) =>
                `Failed to copy registry rule package entry: ${entry}`,
            },
          }),
        );
      });

    const materializeFromExternal = (ref: GitHostedRuleRef | LocalRuleRef) =>
      provide(
        materializeExternalPackage({
          baseDir,
          canonicalPath: path.join(
            baseDir,
            EXTERNAL_EXTENSIONS_DIR,
            RULE_EXTENSION_DIR,
            ref.rule.name,
          ),
          sourceLocation: ref.location,
          copyFailureCode: "validation",
          copyFailureDetail: (canonicalPath) =>
            `Failed to copy rule package files to ${canonicalPath}`,
        }),
      );

    const materializePackage = (ref: RuleExtensionRef, force = false) =>
      Effect.gen(function* () {
        switch (ref.refType) {
          case "registry":
            return yield* materializeFromRegistry(ref, force);
          case "git-hosted":
          case "local":
            return yield* materializeFromExternal(ref);
          case "workspace": {
            const expectedPath = path.join(
              baseDir,
              REGISTRY_EXTENSIONS_DIR,
              ref.owner,
              RULE_EXTENSION_DIR,
              ref.name,
            );
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(expectedPath)
            ) {
              return yield* makeAppError({
                code: "validation",
                detail: `Invalid workspace rule source location: ${ref.location}`,
              });
            }
            return ref.location;
          }
        }
      });

    const readManifest = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, RULE_MANIFEST_FILENAME)).pipe(
        Effect.flatMap((content) =>
          Effect.try({
            try: (): unknown => JSON.parse(content),
            catch: (error) =>
              makeAppError({
                code: "validation",
                detail: `Failed to parse ${RULE_MANIFEST_FILENAME}`,
                cause: error,
              }),
          }),
        ),
        Effect.flatMap((content) => decodeRuleManifest(content)),
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
            detail: `Failed to read ${RULE_MANIFEST_FILENAME}`,
            cause: error,
          }),
        ),
      );

    const sourceFileTarget = () =>
      Effect.gen(function* () {
        const config = yield* ws.getInstructionsConfig();
        const resolved = resolveInstructionsConfig(
          Option.isSome(config) && config.value !== false ? config.value : undefined,
        );
        const relative = makeWorkspaceRelativePath(path, baseDir, resolved.fileName);
        if (Option.isNone(relative)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Rule instruction source escapes workspace: ${resolved.fileName}`,
          });
        }
        return {
          relative: relative.value,
          absolute: path.resolve(baseDir, relative.value),
        };
      });

    const readRuleBody = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, "src", RULE_BODY_FILENAME)).pipe(
        Effect.flatMap(parseFrontmatterEffect),
        Effect.map((parsed) => normalizeMarkdown(parsed.body)),
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
            detail: `Failed to read src/${RULE_BODY_FILENAME}`,
            cause: error,
          }),
        ),
      );

    const markerForRef = (ref: RuleExtensionRef, manifest: RuleManifest): string =>
      markerFqnForRef({ ref, manifest, type: "rule", name: ref.rule.name });

    const renderRuleBlock = (args: {
      readonly marker: string;
      readonly manifest: RuleManifest;
      readonly body: string;
    }): string => {
      const header =
        args.manifest.title !== undefined && !args.body.startsWith("#")
          ? `# ${args.manifest.title}\n\n`
          : "";
      return `<!-- axm:rule ${args.marker}@${args.manifest.version} -->\n${header}${args.body}`;
    };

    const renderRuleRef = (args: {
      readonly ref: RuleExtensionRef;
      readonly packageRoot: string;
    }) =>
      Effect.gen(function* () {
        const manifest = yield* readManifest(args.packageRoot);
        const body = yield* readRuleBody(args.packageRoot);
        return {
          name: args.ref.rule.name,
          marker: markerForRef(args.ref, manifest),
          manifest,
          body,
        };
      });

    const renderInstalledRulesRegion = (args?: {
      readonly include?: {
        readonly ref: RuleExtensionRef;
        readonly packageRoot: string;
      };
      readonly excludeName?: string;
    }) =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredRuleEntries();
        const renderedRules = yield* Effect.forEach(
          Object.entries(configured).filter(
            ([name, entry]) =>
              entry.enabled && name !== args?.excludeName && name !== args?.include?.ref.rule.name,
          ),
          ([name, entry]) =>
            Effect.scoped(provide(resolveConfiguredRule(name, entry.source))).pipe(
              Effect.flatMap(({ ref }) =>
                Effect.gen(function* () {
                  const packageRoot = yield* materializePackage(ref);
                  return yield* renderRuleRef({ ref, packageRoot });
                }),
              ),
            ),
          { concurrency: "unbounded" },
        );

        const included = args?.include === undefined ? [] : [yield* renderRuleRef(args.include)];
        const sorted = [...renderedRules, ...included].sort((a, b) => {
          const byPriority = (a.manifest.priority ?? 100) - (b.manifest.priority ?? 100);
          if (byPriority !== 0) return byPriority;
          return a.marker.localeCompare(b.marker);
        });

        return sorted.map(renderRuleBlock).join("\n\n");
      });

    const writeRulesRegion = (args?: {
      readonly include?: {
        readonly ref: RuleExtensionRef;
        readonly packageRoot: string;
      };
      readonly excludeName?: string;
    }) =>
      Effect.gen(function* () {
        const target = yield* sourceFileTarget();
        const style = commentStyleForTarget(target.relative);
        if (Option.isNone(style)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Instruction source does not support managed regions: ${target.relative}`,
          });
        }

        const rendered = yield* renderInstalledRulesRegion(args);
        // Only treat an absent file as empty; a real read failure on an existing
        // file must propagate, or we would overwrite unreadable user content
        // with just the managed region.
        const fileExists = yield* fs.exists(target.absolute).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to inspect managed instructions file: ${target.absolute}`,
              cause: error,
            }),
          ),
        );
        const existing = fileExists
          ? yield* fs.readFileString(target.absolute).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to read managed instructions file: ${target.absolute}`,
                  cause: error,
                }),
              ),
            )
          : "";
        const updated =
          rendered.length === 0
            ? stripManagedRegion(existing, { region: RULES_REGION }, style.value)
            : replaceManagedRegion({
                content: existing,
                marker: { region: RULES_REGION },
                rendered,
                style: style.value,
              });
        yield* protectWorkspacePath(target.absolute);
        yield* fs.makeDirectory(path.dirname(target.absolute), { recursive: true }).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to create rules managed region target directory: ${path.dirname(target.absolute)}`,
              cause: error,
            }),
          ),
        );
        yield* fs.writeFileString(target.absolute, updated).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to write rules managed region target: ${target.absolute}`,
              cause: error,
            }),
          ),
        );

        return decodeMaterializedTarget({
          target: target.relative,
          mode: "managed-region",
          region: RULES_REGION,
          renderHash: computeSourceHash(rendered),
        });
      });

    const materializeInstall: ExtensionManager<RuleExtensionRef>["materializeInstall"] = Effect.fn(
      "RuleManager.materializeInstall",
    )(function* ({ ref, force }) {
      const packageRoot = yield* materializePackage(ref, force === true);
      yield* readManifest(packageRoot);

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
          : Option.none<string>();
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* makeAppError({
          code: "validation",
          detail: `Local rule source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

      const materializedTarget = yield* writeRulesRegion({ include: { ref, packageRoot } });
      const sourceHash = yield* provide(computePackageContentHash(packageRoot));
      lastInstallState.set(ref.rule.name, {
        ref,
        materializedTargets: [materializedTarget],
        workspaceRelativeLocalSourcePath,
        sourceHash,
      });
    }, Effect.asVoid);

    const buildLockEntry = (ref: RuleExtensionRef): Effect.Effect<RuleLockEntry, never> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.rule.name);
        const now = yield* DateTime.now;
        switch (ref.refType) {
          case "registry":
            return registryRuleLockEntry(ref, now, state?.sourceHash);
          case "git-hosted":
            return gitRuleLockEntry(ref, now, state?.sourceHash);
          case "local":
            return localRuleLockEntry(
              ref,
              now,
              state?.workspaceRelativeLocalSourcePath ?? Option.none(),
              state?.sourceHash,
            );
          case "workspace":
            return workspaceRuleLockEntry(ref, now);
        }
      });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<RuleExtensionRef>["materializeUninstall"] =>
      Effect.fn("RuleManager.materializeRemoval")(function* ({ target }) {
        const canonical = yield* provide(
          trustedCanonicalObservation({
            workspace: ws,
            type: "rule",
            name: target.name,
          }),
        );
        yield* writeRulesRegion({ excludeName: target.name });
        const packageRoot = Option.flatMap(canonical, (state) =>
          Option.fromUndefinedOr(state.observation.path),
        );
        if (!retainCanonical && Option.isSome(packageRoot)) {
          yield* protectWorkspacePath(packageRoot.value);
          yield* fs.remove(packageRoot.value, { recursive: true, force: true }).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to remove rule package source: ${packageRoot.value}`,
                cause: error,
              }),
            ),
          );
        }
      }, Effect.asVoid);
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    return {
      type: "rule",
      runTransaction: ws.runTransaction,
      validateTrustTransition: (args) =>
        ws
          .getTrustState()
          .pipe(Effect.flatMap((state) => validateRefTrustTransition(state, args.ref, args))),
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(ws, "rule", target.name).pipe(
          Effect.withSpan("RuleManager.isInstalled"),
        ),

      materializeInstall,
      getConfiguredSource: Effect.fn("RuleManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredRuleEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),

      listMaterializable: Effect.fn("RuleManager.listMaterializable")(function* () {
        const configured = yield* ws.getConfiguredRuleEntries();
        const refs = yield* Effect.scoped(
          Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) =>
              provide(resolveConfiguredRule(name, entry.source)).pipe(Effect.map(({ ref }) => ref)),
            { concurrency: "unbounded" },
          ),
        );
        return refs;
      }),

      materializeUninstall,
      materializeDeactivate,

      upsertSettingsEntry: Effect.fn("RuleManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }) {
        const lockEntry = yield* buildLockEntry(ref);
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `rules.${ref.rule.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        yield* ws.setRule({
          name: ref.rule.name,
          lockEntry,
          versionRange,
          commit: "authoritative",
        });
      }),

      upsertTrustEntry: Effect.fn("RuleManager.upsertTrustEntry")(function* ({ ref }) {
        const lockEntry = yield* buildLockEntry(ref);
        yield* ws.setRuleLock({
          name: ref.rule.name,
          lockEntry,
          versionRange: Option.none(),
          commit: "authoritative",
        });
      }),

      removeSettingsEntry: Effect.fn("RuleManager.removeSettingsEntry")(function* ({ target }) {
        yield* ws.removeRuleSettings(target.name);
      }),

      upsertLockfileEntry: Effect.fn("RuleManager.upsertLockfileEntry")(function* ({ ref }) {
        const lockEntry = yield* buildLockEntry(ref);
        if (lockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `rules.${ref.rule.name}.resolvedVersion`,
            lockEntry.resolvedVersion,
          );
        }
        yield* ws.setRuleLock({
          name: ref.rule.name,
          lockEntry,
          versionRange: Option.none(),
          commit: "receipt",
        });
      }),

      removeLockfileEntry: Effect.fn("RuleManager.removeLockfileEntry")(function* ({ target }) {
        yield* ws.removeRuleLock(target.name);
      }),
      removeTrustEntry: ({ target }) => ws.removeTrustRecord("rule", target.name),
    };
  }),
);
