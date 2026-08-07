import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as semver from "semver";

import {
  makeAppError,
  type AppError,
  type AppErrorCode,
} from "@agentxm/client-core/unstable/app-error";
import {
  AuthClient,
  CredentialStore,
  DeviceLoginInteraction,
  RegistryUrl,
  resolveRequestToken,
  runPublishAuthorization,
} from "@agentxm/client-core/unstable/auth";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  ExtensionDependencyConstraintMapSchema,
  ExtensionNameSchema,
  ExtensionTypeSchema,
  EXTERNAL_EXTENSIONS_DIR,
  HandleSchema,
  PublishOptionsSchema,
  REGISTRY_EXTENSIONS_DIR,
  extensionTypeToPlural,
  decodeExtensionNameSync,
  fqnInvalidErrorToAppError,
  formatFqn,
  parseFqn,
  parseRegistrySourcePatternParts,
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import type {
  JobStepResult,
  OperationPrecondition,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { CompanionPackageSchema } from "@agentxm/client-core/unstable/package-urls";
import {
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
  inspectKnowledgeBundle,
} from "@agentxm/client-core/unstable/knowledge";
import {
  checkForbiddenSourceEntries,
  enforceArchiveSizeLimit,
  publishArchiveOptions,
  runPublishLintGate,
  validateArchive,
} from "@agentxm/client-core/unstable/publish";
import {
  createRegistryClient,
  type ExtensionVisibility,
  type RegistryClient,
  type VersionEntry,
} from "@agentxm/client-core/unstable/registry";
import { isWorkspaceSourceLocator, type SourceType } from "@agentxm/client-core/unstable/sources";
import {
  buildZipArchive,
  computeIntegrity,
  expandGlobs,
  isGlobPattern,
} from "@agentxm/client-core/unstable/utils";
import { VersionSchema, type Version } from "@agentxm/client-core/unstable/version-constraints";
import {
  WorkspaceMutations,
  configuredRowsByName,
  type WorkspaceScope,
} from "@agentxm/client-core/unstable/workspace";

import { scopeFlag } from "../../cli-flags.js";
import { emitPublishResult, type PublishResultItem } from "../../json-output.js";
import { AuthLayer, withRuntime, withWorkspace } from "../../runtime.js";
import {
  allowOlderFlag,
  allowUnsafeArchiveFlag,
  onExistingFlag,
  resolveExistingVersionPolicy,
  skipExistingFlag,
  type OnExistingPolicy,
} from "../shared/publish-flags.js";
import {
  alreadyPublishedVersionConflict,
  nonMonotonicVersionConflict,
} from "../shared/publish-preflight.js";
import { recoverPublishConflictAsSkipExisting } from "../shared/publish-skip-existing.js";

/**
 * Publish policy, total over every extension type: a new type cannot be added
 * without deciding whether it publishes.
 */
export const PUBLISHABLE_TYPES = {
  skill: true,
  "mcp-server": true,
  subagent: true,
  rule: true,
  hook: true,
  knowledge: true,
  pack: true,
} as const satisfies Record<ExtensionType, boolean>;

type TruthyKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T];

export type PublishableType = TruthyKeys<typeof PUBLISHABLE_TYPES>;

export const isPublishableType = (type: ExtensionType): type is PublishableType =>
  PUBLISHABLE_TYPES[type];

// Explicit order (rule last) is user-visible in the --type flag's help output.
const selectableTypes = [
  "skill",
  "mcp-server",
  "subagent",
  "hook",
  "knowledge",
  "pack",
  "rule",
] as const satisfies ReadonlyArray<ExtensionType>;
type SelectableType = (typeof selectableTypes)[number];
type SelectionMode = "authored" | "all" | "explicit" | "filtered-explicit";
type ExistingVersionPolicy = OnExistingPolicy;

export const aggregatePublishFailure = (
  failedCount: number,
  errors: ReadonlyArray<AppError>,
): AppError => {
  const [firstError] = errors;
  const commonCode: AppErrorCode =
    firstError !== undefined && errors.every((error) => error.code === firstError.code)
      ? firstError.code
      : "internal";

  return makeAppError({
    code: commonCode,
    detail: `Failed to publish ${failedCount} extension${failedCount === 1 ? "" : "s"}${
      firstError !== undefined && commonCode !== "internal" ? `: ${firstError.detail}` : ""
    }`,
    ...(firstError !== undefined && commonCode !== "internal"
      ? { suggestions: firstError.suggestions }
      : {}),
  });
};

const manifestFilename: Readonly<Record<SelectableType, string>> = {
  skill: "skill.json",
  "mcp-server": "mcp.json",
  subagent: "subagent.json",
  rule: "rule.json",
  hook: "hook.json",
  knowledge: "knowledge.json",
  pack: "pack.json",
};

const CandidateManifestSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  version: VersionSchema,
  packages: Schema.optional(Schema.Array(CompanionPackageSchema)),
  dependencies: Schema.optional(ExtensionDependencyConstraintMapSchema),
  publish: Schema.optional(PublishOptionsSchema),
});

interface CatalogEntry {
  readonly type: SelectableType;
  readonly name: string;
  readonly source: string;
}

interface SelectedEntry extends CatalogEntry {
  readonly owner: Handle;
  readonly fqn: string;
  readonly sourceType: SourceType;
  readonly authored: boolean;
  readonly includedDependency?: true;
  readonly extensionDir?: string;
  readonly skipReason?: "not_authored" | "not_publishable";
}

interface PublishCandidate extends SelectedEntry {
  readonly type: PublishableType;
  readonly name: ExtensionName;
  readonly extensionDir: string;
  readonly manifestJson: unknown;
  readonly version: Version;
  readonly packages?: ReadonlyArray<Schema.Schema.Type<typeof CompanionPackageSchema>>;
  readonly dependencies?: Schema.Schema.Type<typeof ExtensionDependencyConstraintMapSchema>;
  readonly archive: Uint8Array;
  readonly integrity: string;
  readonly action: "publish" | "skip";
  readonly existingVersionPolicy: ExistingVersionPolicy;
}

interface TargetRegistry {
  readonly name: string;
  readonly url: string;
}

/** Explicit opt-outs from the publish safety gates, each behind its own flag. */
interface PublishOverrides {
  readonly allowOlder: boolean;
  readonly allowUnsafeArchive: boolean;
}

export interface RootPublishHandlerArgs {
  readonly selectors: ReadonlyArray<string>;
  readonly authored: boolean;
  readonly all: boolean;
  readonly owners: ReadonlyArray<string>;
  readonly types: ReadonlyArray<SelectableType>;
  readonly excludes: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly registryUrl: Option.Option<string>;
  readonly onExisting: Option.Option<ExistingVersionPolicy>;
  readonly skipExisting: boolean;
  readonly allowOlder: boolean;
  readonly allowUnsafeArchive: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
  readonly scope: WorkspaceScope;
  readonly visibility: Option.Option<ExtensionVisibility>;
  readonly includeDependencies: boolean;
  readonly includeDependency: ReadonlyArray<string>;
}

export const publishAuthenticationPreconditions = (options: {
  readonly preview: boolean;
  readonly remoteRegistry: boolean;
  readonly authenticated: boolean;
  readonly hasPublishCandidates: boolean;
}): ReadonlyArray<OperationPrecondition> =>
  options.preview &&
  options.remoteRegistry &&
  !options.authenticated &&
  options.hasPublishCandidates
    ? [
        {
          id: "authentication",
          label: "Registry authentication",
          status: "unmet",
          detail:
            "Publishing requires human authorization before apply; authenticate before preparing a release workflow.",
          blockedOn: "human",
          command: "axm login --device-code --json",
        },
      ]
    : [];

export const validatePublishOwners = (
  owners: ReadonlyArray<Handle>,
  client: Pick<RegistryClient, "ownerExists">,
): Effect.Effect<void, AppError> =>
  Effect.forEach(
    [...new Set(owners)],
    (owner) =>
      client.ownerExists(owner).pipe(
        Effect.flatMap(({ exists }) =>
          exists
            ? Effect.void
            : makeAppError({
                code: "not_found",
                detail: `Publish owner ${owner} does not exist.`,
                suggestions: [
                  {
                    description: "Create the organization in AgentXM before publishing.",
                    url: "https://agentxm.ai/orgs/new",
                  },
                ],
              }),
        ),
      ),
    { concurrency: 4, discard: true },
  );

const entrySource = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return undefined;
  return typeof entry.source === "string" ? entry.source : undefined;
};

const catalogEntries = Effect.fn("Publish.catalogEntries")(function* () {
  const ws = yield* WorkspaceMutations;
  const [skills, mcps, subagents, rules, hooks, knowledge, packs] = yield* Effect.all(
    [
      ws.records.rows("skill").pipe(Effect.map(configuredRowsByName)),
      ws.records.rows("mcp-server").pipe(Effect.map(configuredRowsByName)),
      ws.records.rows("subagent").pipe(Effect.map(configuredRowsByName)),
      ws.getConfiguredRuleEntries(),
      ws.getConfiguredHookEntries(),
      ws.getConfiguredKnowledgeEntries(),
      ws.records.rows("pack").pipe(Effect.map(configuredRowsByName)),
    ],
    { concurrency: "unbounded" },
  );

  const group = (type: SelectableType, entries: Readonly<Record<string, unknown>>) =>
    Object.entries(entries).flatMap(([name, entry]) => {
      const source = entrySource(entry);
      return source === undefined ? [] : [{ type, name, source } satisfies CatalogEntry];
    });

  return [
    ...group("skill", skills),
    ...group("mcp-server", mcps),
    ...group("subagent", subagents),
    ...group("rule", rules),
    ...group("hook", hooks),
    ...group("knowledge", knowledge),
    ...group("pack", packs),
  ];
});

const sourceType = (source: string): SourceType => {
  if (isWorkspaceSourceLocator(source)) return "workspace";
  if (source.startsWith("github:")) return "github";
  if (source.startsWith("gitlab:")) return "gitlab";
  if (source.startsWith("bitbucket:")) return "bitbucket";
  if (source.startsWith("azurerepos:")) return "azurerepos";
  if (source.startsWith("git:")) return "git";
  if (source.startsWith("file:") || source.startsWith("./") || source.startsWith("../")) {
    return "local";
  }
  if (source.startsWith("inline:")) return "inline";
  return "registry";
};

const identityFromSource = (entry: CatalogEntry) => {
  const authored = isWorkspaceSourceLocator(entry.source);
  const identitySource = authored ? entry.source.slice("workspace:".length) : entry.source;
  const parsed = parseRegistrySourcePatternParts(identitySource);
  if (
    parsed === undefined ||
    parsed.name === undefined ||
    parsed.type !== extensionTypeToPlural[entry.type]
  ) {
    return undefined;
  }
  return {
    ...entry,
    owner: parsed.owner,
    fqn: `${parsed.owner}/${parsed.type}/${parsed.name}`,
    sourceType: sourceType(entry.source),
    authored,
  } satisfies SelectedEntry;
};

const identityFromManagedPackage = Effect.fn("Publish.identityFromManagedPackage")(function* (
  entry: CatalogEntry,
) {
  const parsedIdentity = identityFromSource(entry);
  if (parsedIdentity !== undefined) return parsedIdentity;

  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const plural = extensionTypeToPlural[entry.type];
  const extensionRoots = [path.join(ws.baseDir, EXTERNAL_EXTENSIONS_DIR, plural, entry.name)];
  const canonicalRoot = path.join(ws.baseDir, REGISTRY_EXTENSIONS_DIR);
  const ownerDirs = yield* fs
    .readDirectory(canonicalRoot)
    .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));
  for (const ownerDir of ownerDirs) {
    if (ownerDir.startsWith("@")) {
      extensionRoots.push(path.join(canonicalRoot, ownerDir, plural, entry.name));
    }
  }

  for (const extensionDir of extensionRoots) {
    const manifestPath = path.join(extensionDir, manifestFilename[entry.type]);
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) continue;
    const json = yield* Effect.sync((): unknown => {
      try {
        return JSON.parse(raw.value);
      } catch {
        return undefined;
      }
    });
    const manifest = Schema.decodeUnknownOption(CandidateManifestSchema)(json);
    if (
      Option.isNone(manifest) ||
      manifest.value.type !== entry.type ||
      manifest.value.name !== entry.name
    ) {
      continue;
    }
    return {
      ...entry,
      owner: manifest.value.owner,
      fqn: formatFqn(manifest.value),
      sourceType: sourceType(entry.source),
      authored: false,
      extensionDir,
    } satisfies SelectedEntry;
  }
  return undefined;
});

const parseRootSelector = (selector: string) => {
  if (selector.startsWith("@")) {
    return Effect.fromResult(Result.mapError(parseFqn(selector), fqnInvalidErrorToAppError));
  }
  const [plural, name, extra] = selector.split("/");
  if (plural === undefined || name === undefined || extra !== undefined) {
    return makeAppError({
      code: "validation",
      detail: `Root publish selector "${selector}" is ambiguous`,
      recover: "Use @owner/<plural-type>/name or <plural-type>/name.",
    });
  }
  const type = selectableTypes.find((candidate) => extensionTypeToPlural[candidate] === plural);
  if (type === undefined) {
    return makeAppError({
      code: "validation",
      detail: `Unsupported publish selector: ${selector}`,
    });
  }
  return Effect.succeed({ type, name });
};

const matchesSelector = (entry: SelectedEntry, selector: string): boolean => {
  const typeName = `${extensionTypeToPlural[entry.type]}/${entry.name}`;
  const candidates = [entry.fqn, typeName];
  return isGlobPattern(selector)
    ? expandGlobs([selector], candidates).length > 0
    : candidates.includes(selector);
};

const selectEntries = Effect.fn("Publish.selectEntries")(function* (
  catalog: ReadonlyArray<CatalogEntry>,
  args: RootPublishHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const hasFilters = args.owners.length > 0 || args.types.length > 0 || args.excludes.length > 0;
  if (args.all && (args.selectors.length > 0 || args.authored)) {
    return yield* makeAppError({
      code: "usage",
      detail: "--all cannot be combined with selectors or --authored",
    });
  }
  if (args.selectors.length > 0 && hasFilters) {
    return yield* makeAppError({
      code: "usage",
      detail: "Selection filters cannot be combined with explicit selectors",
    });
  }
  if (Option.isSome(args.visibility) && args.selectors.length !== 1) {
    return yield* makeAppError({
      code: "usage",
      detail: "--visibility requires exactly one explicit selector",
    });
  }
  if (args.includeDependency.length > 0 && !args.includeDependencies) {
    return yield* makeAppError({
      code: "usage",
      detail: "--include-dependency requires --include-dependencies",
    });
  }

  const resolvedIdentities = yield* Effect.forEach(
    catalog,
    (entry) => identityFromManagedPackage(entry),
    { concurrency: 8 },
  );
  const identities = resolvedIdentities.filter(
    (identity): identity is SelectedEntry => identity !== undefined,
  );
  let selected: ReadonlyArray<SelectedEntry>;
  let mode: SelectionMode;

  if (args.selectors.length > 0) {
    for (const selector of args.selectors) {
      yield* parseRootSelector(selector);
    }
    selected = identities.filter((entry) =>
      args.selectors.some((selector) => matchesSelector(entry, selector)),
    );
    if (args.authored) selected = selected.filter((entry) => entry.authored);
    mode = args.authored ? "filtered-explicit" : "explicit";
  } else {
    selected = args.all ? identities : identities.filter((entry) => entry.authored);
    mode = args.all ? "all" : "authored";
    if (args.owners.length > 0) {
      selected = selected.filter((entry) => args.owners.includes(entry.owner));
    }
    if (args.types.length > 0) {
      selected = selected.filter((entry) => args.types.includes(entry.type));
    }
    if (args.excludes.length > 0) {
      selected = selected.filter(
        (entry) => !args.excludes.some((selector) => matchesSelector(entry, selector)),
      );
    }
  }

  if (args.includeDependencies) {
    const selectedPacks = selected.filter((entry) => entry.type === "pack");
    for (const pack of selectedPacks) {
      const packDir =
        pack.extensionDir ??
        path.join(ws.baseDir, REGISTRY_EXTENSIONS_DIR, pack.owner, "packs", pack.name);
      const manifestPath = path.join(packDir, manifestFilename.pack);
      const raw = yield* fs.readFileString(manifestPath).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "validation",
            detail: `Cannot read dependencies for ${pack.fqn}`,
            cause,
          }),
        ),
      );
      const json = yield* Effect.try({
        try: (): unknown => JSON.parse(raw),
        catch: (cause) =>
          makeAppError({
            code: "validation",
            detail: `Invalid pack manifest for ${pack.fqn}`,
            cause,
          }),
      });
      const manifest = yield* Schema.decodeUnknownEffect(CandidateManifestSchema)(json).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "validation",
            detail: `Invalid pack manifest for ${pack.fqn}`,
            cause,
          }),
        ),
      );
      for (const dependencyFqn of Object.keys(manifest.dependencies ?? {})) {
        const dependency = identities.find((entry) => entry.fqn === dependencyFqn);
        if (dependency === undefined) {
          const parsed = yield* Effect.fromResult(
            Result.mapError(parseFqn(dependencyFqn), fqnInvalidErrorToAppError),
          );
          selected = [
            ...selected,
            {
              type: parsed.type,
              name: parsed.name,
              source: dependencyFqn,
              owner: parsed.owner,
              fqn: dependencyFqn,
              sourceType: "registry",
              authored: false,
              includedDependency: true,
              skipReason: "not_publishable",
            },
          ];
          continue;
        }
        const explicitlyIncluded = args.includeDependency.some((selector) =>
          matchesSelector(dependency, selector),
        );
        selected = [
          ...selected,
          dependency.authored || explicitlyIncluded
            ? { ...dependency, includedDependency: true }
            : { ...dependency, includedDependency: true, skipReason: "not_authored" },
        ];
      }
    }
  }

  const unique = new Map<string, SelectedEntry>();
  for (const entry of selected) unique.set(`${entry.type}:${entry.owner}:${entry.name}`, entry);
  const entries = [...unique.values()];
  return {
    mode,
    entries: [
      ...entries.filter((entry) => entry.includedDependency === true),
      ...entries.filter((entry) => entry.includedDependency !== true),
    ],
  };
});

const resolveTargetRegistry = Effect.fn("Publish.resolveTargetRegistry")(function* (
  requested: Option.Option<string>,
  urlOverride: Option.Option<string>,
) {
  const ws = yield* WorkspaceMutations;
  if (Option.isSome(urlOverride)) {
    const url = yield* Effect.try({
      try: () => new URL(urlOverride.value).href,
      catch: (cause) =>
        makeAppError({ code: "validation", detail: "--registry-url must be a valid URL", cause }),
    });
    return {
      name: Option.getOrElse(requested, () => "override"),
      url,
    } satisfies TargetRegistry;
  }
  const registries = yield* ws.getRegistrySourceHosts();
  const [defaultRegistry] = registries;
  if (Option.isNone(requested)) {
    if (defaultRegistry === undefined) {
      return yield* makeAppError({ code: "usage", detail: "No registry sources configured" });
    }
    return {
      name: defaultRegistry.name,
      url: defaultRegistry.location.href,
    } satisfies TargetRegistry;
  }
  const source = yield* ws.getConfiguredSourceByName(requested.value);
  if (Option.isNone(source) || source.value.type !== "registry") {
    return yield* makeAppError({
      code: "not_found",
      detail: `Registry source "${requested.value}" not found`,
    });
  }
  return { name: requested.value, url: source.value.location.href } satisfies TargetRegistry;
});

const decodeCandidate = Effect.fn("Publish.decodeCandidate")(function* (
  selected: SelectedEntry,
  policy: ExistingVersionPolicy,
  registry: TargetRegistry,
  visibility: Option.Option<ExtensionVisibility>,
  overrides: PublishOverrides,
) {
  if (selected.skipReason !== undefined) return undefined;
  if (!isPublishableType(selected.type)) return undefined;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const extensionDir =
    selected.extensionDir ??
    path.join(
      ws.baseDir,
      REGISTRY_EXTENSIONS_DIR,
      selected.owner,
      extensionTypeToPlural[selected.type],
      selected.name,
    );
  const manifestPath = path.join(extensionDir, manifestFilename[selected.type]);
  const manifestJson = yield* fs.readFileString(manifestPath).pipe(
    Effect.flatMap((content) =>
      Effect.try({
        try: (): unknown => JSON.parse(content),
        catch: (cause) =>
          makeAppError({ code: "validation", detail: `Invalid JSON in ${manifestPath}`, cause }),
      }),
    ),
    Effect.mapError((cause) =>
      cause._tag === "AppError"
        ? cause
        : makeAppError({ code: "not_found", detail: `Missing manifest: ${manifestPath}`, cause }),
    ),
  );
  const manifest = yield* Schema.decodeUnknownEffect(CandidateManifestSchema)(manifestJson).pipe(
    Effect.mapError((cause) =>
      makeAppError({ code: "validation", detail: `Invalid manifest: ${manifestPath}`, cause }),
    ),
  );
  if (selected.type === "knowledge") {
    const knowledgeManifest = yield* Schema.decodeUnknownEffect(KnowledgeManifestSchema)(
      manifestJson,
    ).pipe(
      Effect.mapError((cause) =>
        makeAppError({ code: "validation", detail: `Invalid manifest: ${manifestPath}`, cause }),
      ),
    );
    const inspection = yield* inspectKnowledgeBundle(
      path.join(extensionDir, KNOWLEDGE_SOURCE_DIR),
    ).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Failed to inspect Knowledge bundle: ${selected.fqn}`,
          cause,
        }),
      ),
    );
    const blocking = inspection.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    if (blocking.length > 0) {
      return yield* makeAppError({
        code: "validation",
        detail: `Knowledge publish validation failed for ${selected.fqn}: ${blocking
          .map((diagnostic) => `${diagnostic.relativePath}: ${diagnostic.message}`)
          .join("; ")}`,
      });
    }
    // The manifest dialect selects how the registry serves the bundle, while
    // the inspector validates against the root index declaration. A mismatch
    // would validate one dialect and publish another.
    if (inspection.okfVersion !== knowledgeManifest.format.version) {
      return yield* makeAppError({
        code: "validation",
        detail: `Knowledge bundle ${selected.fqn} declares okf_version ${inspection.okfVersion} in src/index.md but format.version ${knowledgeManifest.format.version} in its manifest.`,
        suggestions: [
          {
            description: `Set both to the same OKF version (${knowledgeManifest.format.version}).`,
          },
        ],
      });
    }
  }
  if (
    manifest.owner !== selected.owner ||
    manifest.type !== selected.type ||
    manifest.name !== selected.name
  ) {
    return yield* makeAppError({
      code: "validation",
      detail: `Manifest identity does not match configured extension ${selected.fqn}`,
    });
  }
  // Total over `PublishableType`: adding a publishable type without a
  // `PublishLintArgs` arm is a compile error here, not a silently skipped gate.
  yield* runPublishLintGate({
    type: selected.type,
    extensionDir,
    manifestJson,
    platform: { fs, path },
  });
  const archive = yield* buildZipArchive(
    extensionDir,
    yield* publishArchiveOptions(selected.type, manifest.publish?.ignore),
  );
  // Guardrails run on the built bytes and only ever reject: rewriting the
  // archive here would change its integrity digest and break republishing an
  // already-published version under `--on-existing verify`.
  const archiveEntries = yield* validateArchive(archive).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Archive validation failed for ${selected.fqn}: ${cause.message}`,
        cause,
      }),
    ),
  );
  if (!overrides.allowUnsafeArchive) {
    yield* checkForbiddenSourceEntries(archiveEntries).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Refusing to publish ${selected.fqn}: ${cause.message}`,
          suggestions: [
            {
              description:
                "Remove the entry from the extension directory, or re-run with --allow-unsafe-archive to publish it anyway.",
            },
          ],
          cause,
        }),
      ),
    );
  }
  yield* Effect.fromResult(enforceArchiveSizeLimit(archive.length)).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Cannot publish ${selected.fqn}: ${cause.detail}`,
        cause,
      }),
    ),
  );
  const integrity = yield* computeIntegrity(archive);
  const client = yield* createRegistryClient(registry.url);
  const index = yield* client.getExtensionIndex({
    owner: selected.owner,
    type: selected.type,
    name: manifest.name,
  });
  if (Option.isSome(visibility) && Option.isSome(index)) {
    return yield* makeAppError({
      code: "conflict",
      detail: `--visibility is only valid for the initial publish of ${selected.fqn}`,
    });
  }
  const existing = Option.isSome(index)
    ? index.value.versions.find((entry) => entry.version === manifest.version)
    : undefined;
  let action: "publish" | "skip" = "publish";
  if (existing !== undefined) {
    if (policy === "error") {
      return yield* alreadyPublishedVersionConflict({
        fqn: selected.fqn,
        version: manifest.version,
      });
    }
    if (policy === "verify" && existing.integrity !== integrity) {
      return yield* makeAppError({
        code: "conflict",
        detail: `Immutable-version integrity drift for ${selected.fqn}@${manifest.version}`,
        suggestions: [
          {
            description: "Bump the manifest version.",
            cmd: `axm version ${selected.fqn} patch`,
          },
        ],
      });
    }
    action = "skip";
  } else if (Option.isSome(index) && !overrides.allowOlder) {
    // The registry index is ordered by publish time, not by semver, so the
    // highest published version has to be reduced over every entry. Yanked
    // versions count: their version numbers stay burned.
    const highestPublished = index.value.versions.reduce<Version | undefined>(
      (highest, entry) =>
        highest === undefined || semver.gt(entry.version, highest) ? entry.version : highest,
      undefined,
    );
    if (highestPublished !== undefined && semver.lt(manifest.version, highestPublished)) {
      return yield* nonMonotonicVersionConflict({
        fqn: selected.fqn,
        version: manifest.version,
        highestPublished,
      });
    }
  }
  return {
    ...selected,
    type: selected.type,
    name: manifest.name,
    extensionDir,
    manifestJson,
    version: manifest.version,
    ...(manifest.packages === undefined ? {} : { packages: manifest.packages }),
    ...(manifest.dependencies === undefined ? {} : { dependencies: manifest.dependencies }),
    archive,
    integrity,
    action,
    existingVersionPolicy: policy,
  } satisfies PublishCandidate;
});

const publishCandidate = (
  candidate: PublishCandidate,
  registry: TargetRegistry,
  visibility: Option.Option<ExtensionVisibility>,
) =>
  Effect.gen(function* () {
    if (candidate.action === "skip") {
      return {
        result: "success",
        message: `Skipped ${candidate.fqn}@${candidate.version}: version already published`,
      } satisfies JobStepResult;
    }
    const client = yield* createRegistryClient(registry.url);
    const defaultRegistryUrl = yield* RegistryUrl;
    const storedToken = yield* resolveRequestToken(registry.url, defaultRegistryUrl);
    const isRemoteRegistry =
      registry.url.startsWith("https://") || registry.url.startsWith("http://");
    if (isRemoteRegistry && Option.isNone(storedToken) && Option.isSome(visibility)) {
      return yield* makeAppError({
        code: "auth",
        detail:
          "--visibility requires a logged-in session or PAT; an exact publish capability can only upload the approved archive",
        suggestions: [
          {
            description: "Log in or configure a PAT, then rerun publish with --visibility.",
          },
        ],
      });
    }
    const accessToken =
      isRemoteRegistry && Option.isNone(storedToken)
        ? yield* runPublishAuthorization({
            registryUrl: registry.url,
            owner: candidate.owner,
            type: candidate.type,
            name: candidate.name,
            version: candidate.version,
            archive: candidate.archive,
          })
        : undefined;
    const metadata: VersionEntry = {
      version: candidate.version,
      published: yield* DateTime.now,
      integrity: candidate.integrity,
      ...(candidate.packages === undefined ? {} : { packages: candidate.packages }),
      ...(candidate.dependencies === undefined ? {} : { dependencies: candidate.dependencies }),
    };
    const response = yield* client.publishExtension({
      owner: candidate.owner,
      type: candidate.type,
      name: candidate.name,
      version: candidate.version,
      archive: candidate.archive,
      metadata,
      ...(Option.isNone(visibility) ? {} : { initialVisibility: visibility.value }),
      ...(accessToken === undefined ? {} : { accessToken }),
    });
    let verified = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const readback = yield* client.getExtensionIndex({
        owner: candidate.owner,
        type: candidate.type,
        name: candidate.name,
      });
      verified =
        Option.isSome(readback) &&
        readback.value.versions.some(
          (entry) => entry.version === candidate.version && entry.integrity === candidate.integrity,
        );
      if (verified) break;
      if (attempt < 4) yield* Effect.sleep("250 millis");
    }
    if (!verified) {
      return yield* makeAppError({
        code: "internal",
        detail: `Published ${candidate.fqn}@${candidate.version}, but registry readback verification failed`,
      });
    }
    return {
      result: "success",
      message: `Published ${candidate.fqn}@${candidate.version}`,
      ...(response.links === undefined ? {} : { links: response.links }),
    } satisfies JobStepResult;
  });

const selectedResult = (
  entry: SelectedEntry,
  candidate: PublishCandidate | undefined,
): PublishResultItem => {
  if (candidate === undefined) {
    const reason = entry.skipReason ?? "not_publishable";
    return {
      owner: entry.owner,
      type: entry.type,
      name: decodeExtensionNameSync(entry.name),
      sourceType: entry.sourceType,
      authored: entry.authored,
      action: "skip",
      reason,
      status: "success",
      message:
        reason === "not_authored"
          ? "Dependency is not workspace-sourced; include it explicitly to publish"
          : "Dependency is not a managed publish candidate",
    };
  }
  return {
    owner: candidate.owner,
    type: candidate.type,
    name: candidate.name,
    version: candidate.version,
    sourceType: candidate.sourceType,
    authored: candidate.authored,
    action: candidate.action,
    ...(candidate.action === "skip" ? { reason: "version_already_published" } : {}),
  };
};

const failedSelectedResult = (entry: SelectedEntry, error: AppError): PublishResultItem => ({
  owner: entry.owner,
  type: entry.type,
  name: decodeExtensionNameSync(entry.name),
  sourceType: entry.sourceType,
  authored: entry.authored,
  action: "error",
  status: "failed",
  message: error.detail,
});

const runPublish = Effect.fn("Publish.run")(function* (
  args: RootPublishHandlerArgs,
  registry: TargetRegistry,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const authClient = yield* AuthClient;
  const credentialStore = yield* CredentialStore;
  const deviceLoginInteraction = yield* DeviceLoginInteraction;
  const registryUrl = yield* RegistryUrl;
  const renderer = yield* CliRenderer;
  const bulkSelection = args.selectors.length !== 1 || args.selectors.some(isGlobPattern);
  const effectivePolicy = yield* resolveExistingVersionPolicy({
    onExisting: args.onExisting,
    skipExisting: args.skipExisting,
    bulkSelection,
  });
  const includedDependencyPolicy: ExistingVersionPolicy =
    Option.isNone(args.onExisting) && !args.skipExisting ? "verify" : effectivePolicy;
  const prepared = yield* renderer.withSpinner(
    "Preparing publish candidates",
    () =>
      Effect.gen(function* () {
        const catalog = yield* catalogEntries();
        const selection = yield* selectEntries(catalog, args);
        const isRemoteRegistry =
          registry.url.startsWith("https://") || registry.url.startsWith("http://");
        if (isRemoteRegistry && selection.entries.length > 0) {
          const client = yield* createRegistryClient(registry.url);
          yield* validatePublishOwners(
            selection.entries.map((entry) => entry.owner),
            client,
          );
        }
        const decoded = yield* Effect.forEach(
          selection.entries,
          (entry) =>
            Effect.result(
              decodeCandidate(
                entry,
                entry.includedDependency === true ? includedDependencyPolicy : effectivePolicy,
                registry,
                args.visibility,
                {
                  allowOlder: args.allowOlder,
                  allowUnsafeArchive: args.allowUnsafeArchive,
                },
              ),
            ),
          { concurrency: 4 },
        );
        return { selection, decoded };
      }),
    { successMessage: "Prepared publish candidates" },
  );
  const selection = prepared.selection;
  const selected = selection.entries;
  const decoded = prepared.decoded;
  const candidates = decoded.flatMap((result) =>
    Result.isSuccess(result) && result.success !== undefined ? [result.success] : [],
  );
  const preflightErrors = decoded.flatMap((result) =>
    Result.isFailure(result) ? [result.failure] : [],
  );
  const selectionOutput = {
    mode: selection.mode,
    scope: args.scope,
    owners: [...new Set(selected.map((entry) => entry.owner))],
    types: [...new Set(selected.map((entry) => entry.type))],
    registry: registry.name,
  } as const;
  if (selected.length === 0) {
    yield* emitPublishResult("publish", {
      mode: args.preview ? "preview" : "apply",
      selection: selectionOutput,
      results: [],
    });
    return;
  }

  const isRemoteRegistry =
    registry.url.startsWith("https://") || registry.url.startsWith("http://");
  const storedToken = yield* resolveRequestToken(registry.url, registryUrl);
  const authenticationPreconditions = publishAuthenticationPreconditions({
    preview: args.preview,
    remoteRegistry: isRemoteRegistry,
    authenticated: Option.isSome(storedToken),
    hasPublishCandidates: candidates.some((candidate) => candidate.action === "publish"),
  });
  const publishConcurrency = isRemoteRegistry && Option.isNone(storedToken) ? 1 : 4;

  const candidateStep = (candidate: PublishCandidate): PlannedJobStep => {
    const run = publishCandidate(candidate, registry, args.visibility).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(AuthClient, authClient),
      Effect.provideService(CredentialStore, credentialStore),
      Effect.provideService(DeviceLoginInteraction, deviceLoginInteraction),
      Effect.provideService(RegistryUrl, registryUrl),
      Effect.provideService(CliRenderer, renderer),
    );
    return {
      readiness: "ready",
      label: `${candidate.action === "skip" ? "Skip" : "Publish"} ${candidate.fqn}`,
      run:
        candidate.existingVersionPolicy === "error"
          ? run
          : run.pipe(
              Effect.catch(
                recoverPublishConflictAsSkipExisting({
                  registryUrl: registry.url,
                  target: {
                    fqn: candidate.fqn,
                    identity: {
                      owner: candidate.owner,
                      type: candidate.type,
                      name: candidate.name,
                      version: candidate.version,
                    },
                  },
                  scope: args.scope,
                  ...(candidate.existingVersionPolicy === "verify"
                    ? { expectedIntegrity: candidate.integrity }
                    : {}),
                }),
              ),
            ),
    };
  };

  const dependencySteps = decoded.flatMap((result, index): ReadonlyArray<PlannedJobStep> => {
    const entry = selected[index];
    if (entry?.includedDependency !== true) return [];
    if (Result.isFailure(result)) {
      return [
        {
          readiness: "ready",
          label: `Validate ${entry.fqn}`,
          run: Effect.fail(result.failure),
        },
      ];
    }
    return result.success === undefined ? [] : [candidateStep(result.success)];
  });
  const remainingSteps = candidates
    .filter((candidate) => candidate.includedDependency !== true)
    .map(candidateStep);
  const jobs =
    dependencySteps.length === 0
      ? [{ concurrency: publishConcurrency, steps: remainingSteps }]
      : [
          { concurrency: publishConcurrency, steps: dependencySteps },
          { concurrency: publishConcurrency, steps: remainingSteps },
        ];

  const plan: Plan = {
    _tag: "Plan",
    name: "Publish extensions",
    description: Option.some(
      `Publish ${candidates.length} extensions to registry "${registry.name}"`,
    ),
    ...(authenticationPreconditions.length === 0
      ? {}
      : { preconditions: authenticationPreconditions }),
    jobs,
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
    displayApplied: false,
  });
  const failedStepErrors =
    resolution._tag === "ExecutedPlan"
      ? resolution.jobs
          .flatMap((job) => job.steps)
          .flatMap((step) => (step.result.result === "error" ? [step.result.error] : []))
      : [];
  const baseResults = selected.map((entry, index) => {
    const decodedResult = decoded[index];
    if (decodedResult === undefined) return selectedResult(entry, undefined);
    if (Result.isFailure(decodedResult)) return failedSelectedResult(entry, decodedResult.failure);
    return selectedResult(entry, decodedResult.success);
  });
  let results: ReadonlyArray<PublishResultItem>;
  if (resolution._tag === "ExecutedPlan") {
    const byLabel = new Map(
      resolution.jobs.flatMap((job) => job.steps).map((step) => [step.label, step]),
    );
    results = baseResults.map((result) => {
      if (result.action !== "publish") return result;
      const fqn = formatFqn({ owner: result.owner, type: result.type, name: result.name });
      const step = byLabel.get(`Publish ${fqn}`);
      if (step === undefined) return result;
      if (step.result.result === "error") {
        return {
          ...result,
          action: "error",
          status: "failed",
          message: step.result.message,
          ...(step.result.message.includes("readback verification failed")
            ? { reason: "verify_failed" }
            : {}),
        };
      }
      return {
        ...result,
        status: "success",
        message: step.result.message,
        ...(step.result.links === undefined ? {} : { links: step.result.links }),
      };
    });
  } else {
    results = baseResults.map((result) =>
      result.action === "error" ? result : { ...result, status: "pending" },
    );
  }
  yield* emitPublishResult("publish", {
    mode: args.preview ? "preview" : "apply",
    ...(authenticationPreconditions.length === 0
      ? {}
      : { preconditions: authenticationPreconditions }),
    selection: selectionOutput,
    results,
  });
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    return yield* aggregatePublishFailure(failed.length, [...preflightErrors, ...failedStepErrors]);
  }
});

export const handleRootPublish = Effect.fn("Publish.handle")(function* (
  args: RootPublishHandlerArgs,
) {
  const renderer = yield* CliRenderer;
  const registry = yield* renderer.withSpinner(
    "Resolving publish registry",
    () => resolveTargetRegistry(args.registry, args.registryUrl),
    { successMessage: "Resolved publish registry" },
  );
  yield* runPublish(args, registry);
});

const publishConfig = {
  selectors: Argument.string("selectors").pipe(
    Argument.withDescription("FQNs or type-qualified extension selectors"),
    Argument.atLeast(0),
  ),
  authored: Flag.boolean("authored").pipe(
    Flag.withDescription("Publish extensions authored in this workspace"),
  ),
  all: Flag.boolean("all").pipe(Flag.withDescription("Publish all managed local packages")),
  owner: Flag.string("owner").pipe(Flag.withDescription("Filter by owner"), Flag.atLeast(0)),
  type: Flag.choice("type", selectableTypes).pipe(
    Flag.withDescription("Filter by extension type"),
    Flag.atLeast(0),
  ),
  exclude: Flag.string("exclude").pipe(
    Flag.withDescription("Exclude a matching selector"),
    Flag.atLeast(0),
  ),
  scope: scopeFlag,
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry"),
    Flag.optional,
  ),
  registryUrl: Flag.string("registry-url").pipe(
    Flag.withDescription("Override the target registry URL for automation"),
    Flag.optional,
  ),
  onExisting: onExistingFlag,
  skipExisting: skipExistingFlag,
  allowOlder: allowOlderFlag,
  allowUnsafeArchive: allowUnsafeArchiveFlag,
  visibility: Flag.choice("visibility", ["public", "private"] as const).pipe(
    Flag.withDescription("Initial visibility for one explicit publish"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Publish without confirmation")),
  force: forceFlag.pipe(
    Flag.withDescription("Proceed past blocked plan steps; never overwrites a published version"),
  ),
  preview: previewFlag.pipe(Flag.withDescription("Preflight without uploading")),
} as const;

export const publishCommand = Command.make("publish", publishConfig, (parsed) =>
  handleRootPublish({
    selectors: [...parsed.selectors],
    authored: parsed.authored,
    all: parsed.all,
    owners: [...parsed.owner],
    types: [...parsed.type],
    excludes: [...parsed.exclude],
    registry: parsed.registry,
    registryUrl: parsed.registryUrl,
    onExisting: parsed.onExisting,
    skipExisting: parsed.skipExisting,
    allowOlder: parsed.allowOlder,
    allowUnsafeArchive: parsed.allowUnsafeArchive,
    yes: parsed.yes,
    force: parsed.force,
    preview: parsed.preview,
    scope: parsed.scope,
    visibility: parsed.visibility,
    includeDependencies: false,
    includeDependency: [],
  }).pipe(withWorkspace(parsed.scope), Effect.provide(AuthLayer), withRuntime("publish")),
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription("Publish authored or selected extensions to a registry"),
  Command.withExamples([
    { command: "axm publish", description: "Publish every workspace-sourced extension" },
    {
      command: "axm publish --authored --owner @acme --on-existing verify --yes",
      description: "Idempotently publish an authored catalog",
    },
    {
      command: "axm publish @acme/skills/code-review",
      description: "Publish one configured extension explicitly",
    },
  ]),
);
