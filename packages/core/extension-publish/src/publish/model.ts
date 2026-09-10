/**
 * The publish candidate: what a workspace offers a Registry, how a selection
 * narrows it, and what each selected extension must satisfy before it can be
 * uploaded.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as semver from "semver";

import {
  ExtensionDependencyConstraintMapSchema,
  ExtensionMetadataSchema,
  ExtensionNameSchema,
  ExtensionTypeSchema,
  HandleSchema,
  PublishOptionsSchema,
  decodeExtensionNameSync,
  extensionTypeToPlural,
  extensionTypes,
  formatFqn,
  parseFqn,
  parseSourceQualifiedRegistrySourcePatternParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import { CompanionPackageSchema } from "@agentxm/extension-model/unstable/package-urls";
import {
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
} from "@agentxm/extension-model/unstable/knowledge";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { SourceType } from "@agentxm/extension-model/unstable/sources/types";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions/common";
import { VersionSchema, type Version } from "@agentxm/extension-model/unstable/version-constraints";
import {
  checkForbiddenSourceEntries,
  enforceArchiveSizeLimit,
  normalizePublishInput,
  validateArchive,
} from "@agentxm/extension-content";
import { inspectKnowledgeBundle } from "@agentxm/extension-content/knowledge";
import { createRegistryClient } from "@agentxm/registry-client";
import {
  WorkspaceMutations,
  acceptedCanonicalObservation,
  configuredRowsByName,
} from "@agentxm/workspace-state";

import { PublishFailed } from "../errors.js";
import { planZipArchive, type ArchivePlan } from "../archive.js";
import { publishArchiveOptions } from "../publish-ignore.js";
import { runPublishLintGate } from "../lint-gate.js";
import { alreadyPublishedVersionConflict, nonMonotonicVersionConflict } from "../preflight.js";
import { isPublishableType, type PublishableType } from "../publishable-types.js";
import type { PublishSourceAssessment } from "../source-state.js";
import type { ResolvedPublishPreview } from "../authorization.js";
import { computeIntegrity } from "../internal/integrity.js";
import { expandGlobs, isGlobPattern } from "../internal/glob.js";
import type { PublishSelectionDecision } from "./result.js";

export const selectableTypes: ReadonlyArray<PublishableType> =
  extensionTypes.filter(isPublishableType);

/** Whether the run publishes everything authored or an explicit selection. */
export type PublishSelectionMode = "authored" | "explicit";

/** What to do when the exact version is already published. */
export const onExistingPolicies = ["error", "verify"] as const;
export type OnExistingPolicy = (typeof onExistingPolicies)[number];

/**
 * The default is "verify" wherever the selection was not a person naming one
 * extension: a bulk or dependency-expanded run is expected to be idempotent,
 * while naming a version explicitly asserts it is new.
 */
export const resolveExistingVersionPolicy = (
  onExisting: Option.Option<OnExistingPolicy>,
  selection: {
    readonly mode: PublishSelectionMode;
    readonly includedDependency: boolean;
  },
): OnExistingPolicy =>
  Option.getOrElse(onExisting, () =>
    selection.includedDependency || selection.mode === "authored" ? "verify" : "error",
  );

interface ValidationDetail {
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ReadonlyArray<{
    readonly description: string;
    readonly cmd?: string;
    readonly url?: string;
  }>;
  readonly cause?: unknown;
}

const validation = (detail: string, over?: ValidationDetail) =>
  new PublishFailed({ category: "validation", detail, ...over });

export const manifestFilename: Readonly<Record<PublishableType, string>> = {
  skill: "skill.json",
  "mcp-server": "mcp.json",
  subagent: "subagent.json",
  rule: "rule.json",
  hook: "hook.json",
  knowledge: "knowledge.json",
  pack: "pack.json",
};

export const CandidateManifestSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  version: VersionSchema,
  packages: Schema.optional(Schema.Array(CompanionPackageSchema)),
  dependencies: Schema.optional(ExtensionDependencyConstraintMapSchema),
  publish: Schema.optional(PublishOptionsSchema),
  metadata: Schema.optional(ExtensionMetadataSchema),
});

export interface CatalogEntry {
  readonly type: PublishableType;
  readonly name: string;
  readonly source: string;
}

export interface SelectedEntry extends CatalogEntry {
  readonly owner: Handle;
  readonly fqn: string;
  readonly sourceType: SourceType;
  readonly authored: boolean;
  readonly includedDependency?: true;
  readonly includedBy?: ReadonlyArray<string>;
  readonly extensionDir?: string;
  /** Manifest version, when the identity came from a manifest on disk. */
  readonly declaredVersion?: string;
  /** Pack dependency map, when the identity came from a pack manifest on disk. */
  readonly declaredDependencies?: Readonly<Record<string, string>>;
  readonly skipReason?: "not_authored" | "not_publishable";
}

export interface PublishCandidate extends SelectedEntry {
  readonly type: PublishableType;
  readonly name: ExtensionName;
  readonly extensionDir: string;
  readonly manifestJson: unknown;
  readonly version: Version;
  readonly packages?: ReadonlyArray<Schema.Schema.Type<typeof CompanionPackageSchema>>;
  readonly dependencies?: Schema.Schema.Type<typeof ExtensionDependencyConstraintMapSchema>;
  readonly publishVisibility?: ExtensionVisibility;
  readonly publishIgnore?: ReadonlyArray<string>;
  readonly archive: Uint8Array;
  readonly archivePlan: ArchivePlan;
  readonly integrity: string;
  readonly action: "publish" | "skip";
  readonly backfill: boolean;
  readonly extensionExists: boolean;
  readonly publishPreview?: ResolvedPublishPreview;
  readonly sourceAssessment?: PublishSourceAssessment;
}

/**
 * A preparation failure whose reason the result document reports verbatim,
 * separate from the generic candidate-invalid case.
 */
export interface PublishPreparationFailure {
  readonly _tag: "PublishPreparationFailure";
  readonly reason: "version_exists" | "integrity_drift" | "not_authored";
  readonly failure: PublishFailed;
}

export const preparationFailure = (
  reason: PublishPreparationFailure["reason"],
  failure: PublishFailed,
): PublishPreparationFailure => ({ _tag: "PublishPreparationFailure", reason, failure });

export interface TargetRegistry {
  readonly name: string;
  readonly url: string;
}

/** The inputs one publish invocation supplies. */
export interface PublishRequest {
  readonly selectors: ReadonlyArray<string>;
  readonly owners: ReadonlyArray<string>;
  readonly types: ReadonlyArray<PublishableType>;
  readonly excludes: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly registryUrl: Option.Option<string>;
  readonly onExisting: Option.Option<OnExistingPolicy>;
  readonly backfill: boolean;
  readonly acceptWarnings: boolean;
  readonly preview: boolean;
  readonly scope: "project" | "user";
  readonly visibility: Option.Option<ExtensionVisibility>;
  readonly includeDependencies: boolean;
  readonly authorizationRequest?: string;
  readonly waitForHumanSeconds?: number;
  /** No terminal is available to confirm or to guide human verification. */
  readonly unattended: boolean;
}

const entrySource = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return undefined;
  return typeof entry.source === "string" ? entry.source : undefined;
};

/** Every configured extension of a publishable type, with its source string. */
export const catalogEntries = Effect.fn("Publish.catalogEntries")(function* () {
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

  const group = (type: PublishableType, entries: Readonly<Record<string, unknown>>) =>
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

export const sourceType = (source: string): SourceType => {
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

const identityFromSource = (entry: CatalogEntry): SelectedEntry | undefined => {
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(entry.source);
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
    authored: false,
  };
};

/**
 * Resolve a configured entry's published identity: from a Registry-qualified
 * source string, else from the manifest of the managed package on disk.
 */
export const identityFromManagedPackage = Effect.fn("Publish.identityFromManagedPackage")(
  function* (entry: CatalogEntry) {
    const parsedIdentity = identityFromSource(entry);
    if (parsedIdentity !== undefined) return parsedIdentity;

    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const authored = isWorkspaceSourceLocator(entry.source);
    const accepted = authored
      ? Option.none()
      : yield* acceptedCanonicalObservation({ workspace: ws, type: entry.type, name: entry.name });
    const extensionRoots = authored
      ? ws.layout.scope === "project"
        ? [path.join(ws.layout.authoredRoot(entry.type), entry.name)]
        : []
      : Option.match(accepted, {
          onNone: () => [],
          onSome: ({ observation }) => (observation.path === undefined ? [] : [observation.path]),
        });

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
        authored,
        extensionDir,
        declaredVersion: manifest.value.version,
        ...(manifest.value.dependencies === undefined
          ? {}
          : { declaredDependencies: manifest.value.dependencies }),
      } satisfies SelectedEntry;
    }
    return undefined;
  },
);

export const parseRootSelector = (selector: string) => {
  if (selector.startsWith("@")) {
    if (isGlobPattern(selector)) {
      const [owner, plural, name, extra] = selector.split("/");
      const supportedPlural = selectableTypes.some(
        (candidate) => extensionTypeToPlural[candidate] === plural,
      );
      if (
        owner === undefined ||
        plural === undefined ||
        name === undefined ||
        extra !== undefined ||
        !supportedPlural
      ) {
        return Effect.fail(validation(`Unsupported publish selector: ${selector}`));
      }
      return Effect.succeed({ plural, name });
    }
    return Effect.fromResult(
      Result.mapError(parseFqn(selector), (cause) =>
        validation(`Invalid fully qualified name: ${selector}`, { cause }),
      ),
    );
  }
  const [plural, name, extra] = selector.split("/");
  if (plural === undefined || name === undefined || extra !== undefined) {
    return Effect.fail(
      validation(`Root publish selector "${selector}" is ambiguous`, {
        recover: "Use @owner/<plural-type>/name or <plural-type>/name.",
      }),
    );
  }
  const type = selectableTypes.find((candidate) => extensionTypeToPlural[candidate] === plural);
  if (type === undefined) {
    return Effect.fail(validation(`Unsupported publish selector: ${selector}`));
  }
  return Effect.succeed({ type, name });
};

export const matchesSelector = (entry: SelectedEntry, selector: string): boolean => {
  const typeName = `${extensionTypeToPlural[entry.type]}/${entry.name}`;
  const candidates = [entry.fqn, typeName];
  return isGlobPattern(selector)
    ? expandGlobs([selector], candidates).length > 0
    : candidates.includes(selector);
};

export interface PublishSelection {
  readonly mode: PublishSelectionMode;
  readonly decisions: ReadonlyArray<PublishSelectionDecision>;
  readonly entries: ReadonlyArray<SelectedEntry>;
  /** Every identity the catalog resolved, selected or not. */
  readonly identities: ReadonlyArray<SelectedEntry>;
}

export const selectEntries = Effect.fn("Publish.selectEntries")(function* (
  catalog: ReadonlyArray<CatalogEntry>,
  args: PublishRequest,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const hasFilters = args.owners.length > 0 || args.types.length > 0 || args.excludes.length > 0;
  if (args.selectors.length > 0 && hasFilters) {
    return yield* Effect.fail(
      new PublishFailed({
        category: "usage",
        detail: "Selection filters cannot be combined with explicit selectors",
      }),
    );
  }
  const resolvedIdentities = yield* Effect.forEach(
    catalog,
    (entry) => identityFromManagedPackage(entry),
    { concurrency: 8 },
  );
  const identities: Array<SelectedEntry> = [];
  for (const identity of resolvedIdentities) {
    if (identity !== undefined) identities.push(identity);
  }
  let selected: ReadonlyArray<SelectedEntry>;
  let mode: PublishSelectionMode;

  if (args.selectors.length > 0) {
    for (const selector of args.selectors) {
      yield* parseRootSelector(selector);
    }
    selected = identities
      .filter((entry) => args.selectors.some((selector) => matchesSelector(entry, selector)))
      .map((entry) => (entry.authored ? entry : { ...entry, skipReason: "not_authored" }));
    mode = "explicit";
  } else {
    selected = identities.filter((entry) => entry.authored);
    mode = "authored";
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
        (ws.layout.scope === "project"
          ? path.join(ws.layout.authoredRoot("pack"), pack.name)
          : path.join(ws.layout.acquiredRoot, pack.owner, "packs", pack.name));
      const manifestPath = path.join(packDir, manifestFilename.pack);
      const raw = yield* fs
        .readFileString(manifestPath)
        .pipe(
          Effect.mapError((cause) =>
            validation(`Cannot read dependencies for ${pack.fqn}`, { cause }),
          ),
        );
      const json = yield* Effect.try({
        try: (): unknown => JSON.parse(raw),
        catch: (cause) => validation(`Invalid pack manifest for ${pack.fqn}`, { cause }),
      });
      const manifest = yield* Schema.decodeUnknownEffect(CandidateManifestSchema)(json).pipe(
        Effect.mapError((cause) => validation(`Invalid pack manifest for ${pack.fqn}`, { cause })),
      );
      for (const dependencyFqn of Object.keys(manifest.dependencies ?? {})) {
        const dependency = identities.find((entry) => entry.fqn === dependencyFqn);
        if (dependency === undefined) {
          const parsed = yield* Effect.fromResult(
            Result.mapError(parseFqn(dependencyFqn), (cause) =>
              validation(`Invalid fully qualified name: ${dependencyFqn}`, { cause }),
            ),
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
              includedBy: [pack.fqn],
              skipReason: "not_publishable",
            },
          ];
          continue;
        }
        selected = [
          ...selected,
          dependency.authored
            ? { ...dependency, includedDependency: true, includedBy: [pack.fqn] }
            : {
                ...dependency,
                includedDependency: true,
                includedBy: [pack.fqn],
                skipReason: "not_authored",
              },
        ];
      }
    }
  }

  const unique = new Map<string, SelectedEntry>();
  for (const entry of selected) {
    const key = `${entry.type}:${entry.owner}:${entry.name}`;
    const existing = unique.get(key);
    unique.set(
      key,
      existing === undefined
        ? entry
        : {
            ...existing,
            ...entry,
            includedBy: [...new Set([...(existing.includedBy ?? []), ...(entry.includedBy ?? [])])],
          },
    );
  }
  const entries = [...unique.values()];
  const selectedByFqn = new Map(entries.map((entry) => [entry.fqn, entry]));
  const decisions: ReadonlyArray<PublishSelectionDecision> = [
    ...identities.map((identity): PublishSelectionDecision => {
      const included = selectedByFqn.get(identity.fqn);
      const excluded = args.excludes.some((selector) => matchesSelector(identity, selector));
      const disposition =
        included?.skipReason === "not_authored"
          ? "not-authored"
          : included?.skipReason === "not_publishable"
            ? "not-publishable"
            : included !== undefined
              ? "included"
              : excluded
                ? "excluded"
                : identity.authored
                  ? "excluded"
                  : "not-authored";
      const reason =
        disposition === "included"
          ? "selected"
          : disposition === "not-authored"
            ? "not_authored"
            : disposition === "not-publishable"
              ? "not_publishable"
              : "excluded";
      return {
        id: identity.fqn,
        ...(args.selectors.find((selector) => matchesSelector(identity, selector)) === undefined
          ? {}
          : { selector: args.selectors.find((selector) => matchesSelector(identity, selector)) }),
        target: {
          owner: identity.owner,
          type: identity.type,
          name: decodeExtensionNameSync(identity.name),
        },
        origin:
          included?.includedDependency === true
            ? "dependency-expansion"
            : args.selectors.length > 0
              ? "explicit-selector"
              : "bulk-selection",
        disposition,
        reason,
        referencedBy: included?.includedBy ?? [],
      };
    }),
    ...entries.flatMap((entry): ReadonlyArray<PublishSelectionDecision> =>
      identities.some((identity) => identity.fqn === entry.fqn)
        ? []
        : [
            {
              id: entry.fqn,
              target: {
                owner: entry.owner,
                type: entry.type,
                name: decodeExtensionNameSync(entry.name),
              },
              origin: "dependency-expansion",
              disposition: entry.skipReason === "not_authored" ? "not-authored" : "not-publishable",
              reason: entry.skipReason === "not_authored" ? "not_authored" : "not_publishable",
              referencedBy: entry.includedBy ?? [],
            },
          ],
    ),
    ...catalog.flatMap((entry, index): ReadonlyArray<PublishSelectionDecision> =>
      resolvedIdentities[index] === undefined
        ? [
            {
              id: `unmanaged:${entry.type}:${entry.name}`,
              origin: args.selectors.length > 0 ? "explicit-selector" : "bulk-selection",
              disposition: "unmanaged",
              reason: "unmanaged",
              referencedBy: [],
            },
          ]
        : [],
    ),
    ...args.selectors.flatMap((selector): ReadonlyArray<PublishSelectionDecision> =>
      identities.some((entry) => matchesSelector(entry, selector))
        ? []
        : [
            {
              id: `selector:${selector}`,
              selector,
              origin: "explicit-selector",
              disposition: "unmatched",
              reason: "unmatched_selector",
              referencedBy: [],
            },
          ],
    ),
  ];
  return {
    mode,
    decisions,
    identities,
    entries: [
      ...entries.filter((entry) => entry.includedDependency === true),
      ...entries.filter((entry) => entry.includedDependency !== true),
    ],
  } satisfies PublishSelection;
});

export const resolveTargetRegistry = Effect.fn("Publish.resolveTargetRegistry")(function* (
  requested: Option.Option<string>,
  urlOverride: Option.Option<string>,
) {
  const ws = yield* WorkspaceMutations;
  if (Option.isSome(urlOverride)) {
    const url = yield* Effect.try({
      try: () => new URL(urlOverride.value).href,
      catch: (cause) => validation("--registry-url must be a valid URL", { cause }),
    });
    return { name: Option.getOrElse(requested, () => "override"), url } satisfies TargetRegistry;
  }
  const registries = yield* ws.getRegistrySourceHosts();
  const [defaultRegistry] = registries;
  if (Option.isNone(requested)) {
    if (defaultRegistry === undefined) {
      return yield* Effect.fail(
        new PublishFailed({ category: "usage", detail: "No registry sources configured" }),
      );
    }
    return {
      name: defaultRegistry.name,
      url: defaultRegistry.location.href,
    } satisfies TargetRegistry;
  }
  const source = yield* ws.getConfiguredSourceByName(requested.value);
  if (Option.isNone(source) || source.value.type !== "registry") {
    return yield* Effect.fail(
      new PublishFailed({
        category: "not_found",
        detail: `Registry source "${requested.value}" not found`,
      }),
    );
  }
  return { name: requested.value, url: source.value.location.href } satisfies TargetRegistry;
});

const developmentRootWarning = (
  plan: ArchivePlan,
  ignoreDeclared: boolean,
): ReadonlyArray<string> => {
  if (ignoreDeclared) return [];
  const likelyDevelopmentRoots = ["evals/", "tests/", "fixtures/", "benchmarks/"];
  const developmentRoots = likelyDevelopmentRoots.filter((root) =>
    plan.included.some((file) => file.path.startsWith(root)),
  );
  return developmentRoots.length === 0
    ? []
    : [
        `Review the Registry distribution boundary: ${developmentRoots.join(", ")} ${developmentRoots.length === 1 ? "is" : "are"} included and publish.ignore has no explicit decision. Shipping these files may be intentional; AXM never excludes them automatically.`,
      ];
};

/**
 * Turn one selected entry into an upload candidate: decode its manifest,
 * validate its content, plan and build its archive, and settle the
 * existing-version decision against the Registry index.
 */
export const decodeCandidate = Effect.fn("Publish.decodeCandidate")(function* (
  selected: SelectedEntry,
  policy: OnExistingPolicy,
  registry: TargetRegistry,
  backfillRequested: boolean,
) {
  if (selected.skipReason === "not_authored" && selected.includedDependency !== true) {
    return yield* Effect.fail(
      preparationFailure(
        "not_authored",
        new PublishFailed({
          category: "conflict",
          detail: `${selected.fqn} is not authored by this workspace and cannot be published from mutable installed content. Run \`axm adopt ${selected.fqn}\` when this workspace should own it, or \`axm fork ${selected.fqn} <new-extension>\` for a separately authored identity.`,
          suggestions: [
            {
              description:
                "Adopt the canonical package when this workspace should own and publish it.",
              cmd: `axm adopt ${selected.fqn}`,
            },
            {
              description: "Fork the package when the published result should have a new identity.",
              cmd: `axm fork ${selected.fqn} <new-extension>`,
            },
          ],
        }),
      ),
    );
  }
  if (selected.skipReason !== undefined) return undefined;
  if (!isPublishableType(selected.type)) return undefined;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const extensionDir =
    selected.extensionDir ??
    (ws.layout.scope === "project" && selected.authored
      ? path.join(ws.layout.authoredRoot(selected.type), selected.name)
      : path.join(
          ws.layout.acquiredRoot,
          selected.owner,
          extensionTypeToPlural[selected.type],
          selected.name,
        ));
  const manifestPath = path.join(extensionDir, manifestFilename[selected.type]);
  const manifestJson = yield* fs.readFileString(manifestPath).pipe(
    Effect.flatMap((content) =>
      Effect.try({
        try: (): unknown => JSON.parse(content),
        catch: (cause) => validation(`Invalid JSON in ${manifestPath}`, { cause }),
      }),
    ),
    Effect.mapError((cause) =>
      cause instanceof PublishFailed
        ? cause
        : new PublishFailed({
            category: "not_found",
            detail: `Missing manifest: ${manifestPath}`,
            cause,
          }),
    ),
  );
  const manifest = yield* Schema.decodeUnknownEffect(CandidateManifestSchema)(manifestJson).pipe(
    Effect.mapError((cause) => validation(`Invalid manifest: ${manifestPath}`, { cause })),
  );
  if (selected.type === "knowledge") {
    const knowledgeManifest = yield* Schema.decodeUnknownEffect(KnowledgeManifestSchema)(
      manifestJson,
    ).pipe(Effect.mapError((cause) => validation(`Invalid manifest: ${manifestPath}`, { cause })));
    const inspection = yield* inspectKnowledgeBundle(
      path.join(extensionDir, KNOWLEDGE_SOURCE_DIR),
    ).pipe(
      Effect.mapError((cause) =>
        validation(`Failed to inspect Knowledge bundle: ${selected.fqn}`, { cause }),
      ),
    );
    const blocking = inspection.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    if (blocking.length > 0) {
      return yield* Effect.fail(
        validation(
          `Knowledge publish validation failed for ${selected.fqn}: ${blocking
            .map((diagnostic) => `${diagnostic.relativePath}: ${diagnostic.message}`)
            .join("; ")}`,
        ),
      );
    }
    // The manifest dialect selects how the registry serves the bundle, while
    // the inspector validates against the root index declaration. A mismatch
    // would validate one dialect and publish another.
    if (inspection.okfVersion !== knowledgeManifest.format.version) {
      return yield* Effect.fail(
        validation(
          `Knowledge bundle ${selected.fqn} declares okf_version ${inspection.okfVersion} in src/index.md but format.version ${knowledgeManifest.format.version} in its manifest.`,
          {
            suggestions: [
              {
                description: `Set both to the same OKF version (${knowledgeManifest.format.version}).`,
              },
            ],
          },
        ),
      );
    }
  }
  if (
    manifest.owner !== selected.owner ||
    manifest.type !== selected.type ||
    manifest.name !== selected.name
  ) {
    return yield* Effect.fail(
      validation(`Manifest identity does not match configured extension ${selected.fqn}`),
    );
  }
  // Total over `PublishableType`: adding a publishable type without a
  // `PublishLintArgs` arm is a compile error here, not a silently skipped gate.
  yield* runPublishLintGate({
    type: selected.type,
    extensionDir,
    manifestJson,
    platform: { fs, path },
  });
  const plannedArchive = yield* planZipArchive(
    extensionDir,
    yield* publishArchiveOptions(selected.type, manifest.publish?.ignore),
  );
  const archive = plannedArchive.archive;
  const archivePlan: ArchivePlan = {
    ...plannedArchive.plan,
    warnings: [
      ...plannedArchive.plan.warnings,
      ...developmentRootWarning(plannedArchive.plan, manifest.publish?.ignore !== undefined),
    ],
  };
  // Guardrails run on the built bytes and only ever reject: rewriting the
  // archive here would change its integrity digest and break republishing an
  // already-published version under `--on-existing verify`.
  const archiveEntries = yield* validateArchive(archive).pipe(
    Effect.mapError((cause) =>
      validation(`Archive validation failed for ${selected.fqn}: ${cause.message}`, { cause }),
    ),
  );
  yield* checkForbiddenSourceEntries(archiveEntries).pipe(
    Effect.mapError((cause) =>
      validation(`Refusing to publish ${selected.fqn}: ${cause.message}`, {
        suggestions: [{ description: "Remove the unsafe entry from the extension directory." }],
        cause,
      }),
    ),
  );
  yield* Effect.fromResult(enforceArchiveSizeLimit(archive.length)).pipe(
    Effect.mapError((cause) =>
      validation(`Cannot publish ${selected.fqn}: ${cause.detail}`, { cause }),
    ),
  );
  const integrity = computeIntegrity(archive);
  yield* normalizePublishInput({
    declaredIdentity: {
      owner: selected.owner,
      type: selected.type,
      name: manifest.name,
      version: manifest.version,
    },
    archive: {
      archiveBytes: archive,
      archiveContentType: "application/zip",
      clientIntegrity: integrity,
    },
  }).pipe(
    Effect.mapError((cause) =>
      validation(
        `Filtered archive validation failed for ${selected.fqn}: ${"detail" in cause ? cause.detail : cause.message}`,
        { cause },
      ),
    ),
  );
  const client = yield* createRegistryClient(registry.url);
  const index = yield* client.getExtensionIndex({
    owner: selected.owner,
    type: selected.type,
    name: manifest.name,
  });
  const existing = Option.isSome(index)
    ? index.value.versions.find((entry) => entry.version === manifest.version)
    : undefined;
  let action: "publish" | "skip" = "publish";
  let backfill = false;
  if (existing !== undefined) {
    if (policy === "error") {
      return yield* alreadyPublishedVersionConflict({
        fqn: selected.fqn,
        version: manifest.version,
      }).pipe(Effect.mapError((failure) => preparationFailure("version_exists", failure)));
    }
    if (policy === "verify" && existing.integrity !== integrity) {
      return yield* Effect.fail(
        preparationFailure(
          "integrity_drift",
          new PublishFailed({
            category: "conflict",
            detail: `Immutable-version integrity drift for ${selected.fqn}@${manifest.version}`,
            suggestions: [
              {
                description: "Bump the manifest version.",
                cmd: `axm version ${selected.fqn} patch`,
              },
            ],
          }),
        ),
      );
    }
    action = "skip";
  } else if (Option.isSome(index)) {
    // The registry index is ordered by publish time, not by semver, so the
    // highest published version has to be reduced over every entry. Yanked
    // versions count: their version numbers stay burned.
    const highestPublished = index.value.versions.reduce<Version | undefined>(
      (highest, entry) =>
        highest === undefined || semver.gt(entry.version, highest) ? entry.version : highest,
      undefined,
    );
    if (highestPublished !== undefined && semver.lt(manifest.version, highestPublished)) {
      if (!backfillRequested) {
        return yield* nonMonotonicVersionConflict({
          fqn: selected.fqn,
          version: manifest.version,
          highestPublished,
        });
      }
      backfill = true;
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
    ...(manifest.publish?.visibility === undefined
      ? {}
      : { publishVisibility: manifest.publish.visibility }),
    ...(manifest.publish?.ignore === undefined ? {} : { publishIgnore: manifest.publish.ignore }),
    archive,
    archivePlan,
    integrity,
    action,
    backfill,
    extensionExists: Option.isSome(index),
  } satisfies PublishCandidate;
});

/**
 * Per-type publish selection: a bare name means "this type's package with
 * that name", and a fully qualified selector must name the same type the
 * command group addresses.
 */
const normalizeTypeSelector = (type: PublishableType, selector: string) =>
  Effect.gen(function* () {
    if (!selector.startsWith("@")) return `${extensionTypeToPlural[type]}/${selector}`;
    const parsed = yield* Effect.fromResult(
      Result.mapError(parseFqn(selector), (cause) =>
        validation(`Invalid fully qualified name: ${selector}`, { cause }),
      ),
    );
    if (parsed.type !== type) {
      return yield* Effect.fail(
        validation(`Expected a ${extensionTypeToPlural[type]} selector, got ${selector}`),
      );
    }
    return selector;
  });

/** Narrow a per-type invocation to the root publish selection it means. */
export const normalizeTypePublishSelection = Effect.fn("Publish.normalizeTypeSelection")(
  function* (args: {
    readonly type: PublishableType;
    readonly selectors: ReadonlyArray<string>;
    readonly owners: ReadonlyArray<string>;
    readonly excludes: ReadonlyArray<string>;
  }) {
    const selectors = yield* Effect.forEach(args.selectors, (selector) =>
      normalizeTypeSelector(args.type, selector),
    );
    const excludes = yield* Effect.forEach(args.excludes, (selector) =>
      normalizeTypeSelector(args.type, selector),
    );
    return {
      selectors,
      owners: [...args.owners],
      types: selectors.length === 0 ? [args.type] : [],
      excludes,
    };
  },
);
