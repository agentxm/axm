// @effect-diagnostics globalDate:off — ZIP's driver API requires one fixed Date value and never reads the ambient clock
/**
 * Build a deterministic zip archive of a directory.
 *
 * Uses fflate (pure JS) so publish works on platforms without a system
 * `zip` binary (notably Windows). Entries are walked via the platform
 * FileSystem service, sorted by relative path, and stamped with a fixed
 * mtime so the byte output is reproducible.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { sha512Integrity } from "@agentxm/host-primitives";
import { archiveSha256Hex } from "@agentxm/registry-protocol/unstable/registry/publication-set";
import { validateArchive, type ValidatedArchive } from "@agentxm/extension-content";
import { validateContainedLink } from "@agentxm/workspace-kernel/locations";
import { zipSync, type Zippable } from "fflate";
import type {
  ResolvedFileSelection,
  SelectionRuleOrigin,
  SelectionDecision,
} from "@agentxm/workspace-kernel/acquisition";
import { excludedDistributionLinkTarget } from "@agentxm/workspace-kernel/acquisition";
import { resolvePublishSelection, type PublishFileSelectionOptions } from "./publish-selection.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { OperationRefused } from "@agentxm/workspace-kernel/operations";
import { publishRefused } from "./errors.js";

// ZIP timestamps have no timezone. fflate serializes Date's local calendar
// fields, so construct those fields locally to keep the encoded bytes stable
// across host timezones.
// eslint-disable-next-line no-restricted-syntax -- ZIP's driver API requires Date; this fixed value never reads the ambient clock.
const DETERMINISTIC_MTIME = new Date(2020, 0, 1, 0, 0, 0, 0);
const READ_CONCURRENCY = 16;

/** Preserve arbitrary public metadata; publication selection belongs only to the author. */
const distributionManifest = (bytes: Uint8Array) =>
  Effect.gen(function* () {
    const object = Schema.Record(Schema.String, Schema.Unknown);
    const manifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(object))(
      new TextDecoder().decode(bytes),
    );
    const publish = manifest["publish"];
    if (!Schema.is(object)(publish)) return { bytes, removed: [] };
    const removed = ["include", "exclude"].filter((field) => Object.hasOwn(publish, field));
    if (removed.length === 0) return { bytes, removed };
    const publication = { ...publish };
    for (const field of removed) delete publication[field];
    const distributed = { ...manifest };
    if (Object.keys(publication).length === 0) delete distributed["publish"];
    else distributed["publish"] = publication;
    return {
      bytes: new TextEncoder().encode(`${JSON.stringify(distributed, null, 2)}\n`),
      removed,
    };
  }).pipe(
    Effect.mapError((cause) =>
      publishRefused({
        category: "validation",
        detail: "Cannot prepare the distribution manifest.",
        cause,
      }),
    ),
  );

/** @experimental This API is unstable and may change without notice. */
export interface BuildZipArchiveOptions extends PublishFileSelectionOptions {
  /** Wrap an existing skill root under src/ with a separately supplied manifest. */
  readonly skillEnvelope?: Uint8Array;
}

/** One file, link, or empty directory in the deterministic Registry archive plan. */
interface ArchivePlanEntry {
  readonly path: string;
  readonly sourcePath?: string;
  readonly size: number;
  readonly matchedPatterns: ReadonlyArray<string>;
  readonly ruleOrigin?: SelectionRuleOrigin;
}

/** Match accounting for one effective selection rule. */
interface ArchivePlanPattern {
  readonly pattern: string;
  readonly matchCount: number;
  readonly origin: SelectionRuleOrigin;
}

/** The effective Registry-only distribution boundary before ZIP construction. */
export interface ArchivePlan {
  readonly included: ReadonlyArray<ArchivePlanEntry>;
  readonly excluded: ReadonlyArray<ArchivePlanEntry>;
  readonly patterns: ReadonlyArray<ArchivePlanPattern>;
  readonly patternCoverage: {
    readonly explicit: "all";
    readonly inherited: "matched-only";
    readonly omittedInheritedCount: number;
  };
  readonly warnings: ReadonlyArray<string>;
  readonly includedCount: number;
  readonly excludedCount: number;
  readonly uncompressedBytes: number;
}

/** Deterministic archive bytes paired with the exact plan that produced them. */
interface PlannedZipArchive {
  readonly archive: ValidatedArchive;
  readonly plan: ArchivePlan;
  readonly selection: ResolvedFileSelection;
  readonly policyFingerprint: string;
}

/**
 * Walk a directory and build its deterministic zip. The returned bytes are
 * the archive owner's own: callers in this module admit (copy) or digest
 * them and never hand the buffer itself to another holder.
 */
/**
 * Hands over the bytes a caller already read for one absolute source path, at
 * most once, or nothing. Only preparation supplies one; a rebuild reads live.
 */
type TakeSourceBytes = (abs: string) => Uint8Array | undefined;

/**
 * What the walk observed of one source entry it examined itself, as a Git
 * comparison of the same entry would: a link's raw target, an empty
 * directory, or a regular file's executable bit and, when it read them, its
 * raw bytes.
 */
type SourceObservation =
  | { readonly kind: "link"; readonly target: string }
  | { readonly kind: "directory" }
  | { readonly kind: "file"; readonly executable: boolean; readonly bytes?: Uint8Array };

const zipDistribution = (
  dir: string,
  options?: BuildZipArchiveOptions,
  takeSourceBytes?: TakeSourceBytes,
  /** Hand the walk's own source observations to the caller; only preparation asks. */
  observeSources = false,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // The listing stays with this walk; neither it nor the Git root reaches
    // the returned plan.
    const { listing, gitRoot, ...resolved } = yield* resolvePublishSelection(
      dir,
      options ?? {},
      options?.skillEnvelope === undefined
        ? (options?.manifest ?? manifestFilenameForType("skill"))
        : undefined,
    );

    const manifestName = options?.manifest ?? manifestFilenameForType("skill");
    const warnings: Array<string> = [];
    let manifestFingerprint: string | undefined;
    const prepareManifest = (bytes: Uint8Array) =>
      Effect.gen(function* () {
        manifestFingerprint = sha512Integrity(bytes);
        const prepared = yield* distributionManifest(bytes);
        if (prepared.removed.length > 0)
          warnings.push(
            `Distribution manifest omits ${prepared.removed.map((field) => `publish.${field}`).join(", ")}; source configuration is unchanged.`,
          );
        return prepared.bytes;
      });
    const files = yield* Effect.gen(function* () {
      const candidates: Array<{
        readonly rel: string;
        readonly abs: string;
        readonly size: number;
        readonly mode: number;
        readonly sourcePath?: string;
        readonly decision: SelectionDecision;
        readonly payload?: Uint8Array;
        /** The source path relative to `dir` and what the walk observed there. */
        readonly observed?: { readonly key: string; readonly observation: SourceObservation };
      }> = [];
      if (options?.skillEnvelope !== undefined) {
        const envelope = yield* prepareManifest(options.skillEnvelope);
        candidates.push({
          rel: manifestFilenameForType("skill"),
          abs: "",
          size: envelope.byteLength,
          mode: 0o100644,
          decision: {
            included: true,
            reason: "rule",
            matchedRules: [],
            decidingRule: {
              pattern: manifestFilenameForType("skill"),
              baseDirectory: "",
              origin: { kind: "builtin", rule: "required-manifest" },
            },
          },
          payload: envelope,
        });
      }
      // Each directory is listed once: by the ignore observation that walked
      // this tree for the selection, or here, where a directory's emptiness
      // probe also supplies the names its descent walks.
      const list = (relative: string) =>
        Effect.suspend(() => {
          const listed = listing?.names(relative);
          return listed === undefined
            ? fs.readDirectory(path.join(dir, relative))
            : Effect.succeed(listed);
        });
      // An entry's link and kind come from the same observation when it
      // examined that entry; `.git` it never examines, so that reads live.
      const observe = (parent: string, name: string, abs: string) =>
        Effect.gen(function* () {
          const facts = listing?.facts(parent, name);
          if (facts !== undefined)
            return facts.kind === "link"
              ? { kind: "link" as const, target: facts.target }
              : { kind: "entry" as const, info: facts };
          const link = yield* fs.readLink(abs).pipe(Effect.option);
          if (Option.isSome(link)) return { kind: "link" as const, target: link.value };
          return { kind: "entry" as const, info: yield* fs.stat(abs) };
        });
      const pending = [{ parent: "", children: yield* list("") }];
      while (pending.length > 0) {
        const next = pending.pop();
        if (next === undefined) break;
        const { parent, children } = next;
        for (const name of children) {
          const relative = path.join(parent, name);
          const abs = path.join(dir, relative);
          const relativePath = relative.split(path.sep).join("/");
          const rel = options?.skillEnvelope === undefined ? relativePath : `src/${relativePath}`;
          const publicationControl = name.toLowerCase() === ".gitignore";
          if (name === ".git" || publicationControl) {
            const observed = yield* observe(parent, name, abs);
            const kind =
              observed.kind === "link"
                ? "symlink"
                : observed.info.type === "Directory"
                  ? "directory"
                  : "file";
            const selected = resolved.selection.evaluate({ path: relativePath, kind });
            if (publicationControl) {
              warnings.push(
                `Omitted publication control file "${rel}"${selected.matchedRules.some((rule) => rule.origin.kind === "manifest" && (rule.origin.field === "include" ? !rule.pattern.startsWith("!") : rule.pattern.startsWith("!"))) ? "; explicit inclusion cannot override this exclusion" : ""}.`,
              );
            }
            candidates.push({
              rel: kind === "directory" ? `${rel}/` : rel,
              abs,
              sourcePath: relativePath,
              size:
                observed.kind === "link"
                  ? new TextEncoder().encode(observed.target).length
                  : observed.info.type === "File"
                    ? Number(observed.info.size)
                    : 0,
              mode: 0,
              payload: new Uint8Array(),
              decision: selected,
            });
            continue;
          }
          const observed = yield* observe(parent, name, abs);
          if (observed.kind === "link") {
            if (options?.skillEnvelope === undefined && relativePath === manifestName) {
              return yield* publishRefused({
                category: "validation",
                detail: "The distribution manifest must be a regular file, not a symbolic link.",
              });
            }
            yield* validateContainedLink(dir, abs, observed.target);
            const payload = new TextEncoder().encode(observed.target);
            candidates.push({
              rel,
              abs,
              sourcePath: relativePath,
              size: payload.length,
              mode: 0o120777,
              payload,
              decision: resolved.selection.evaluate({ path: relativePath, kind: "symlink" }),
              observed: {
                key: relativePath,
                observation: { kind: "link", target: observed.target },
              },
            });
            continue;
          }
          const info = observed.info;
          if (info.type === "Directory") {
            const contents = yield* list(relative);
            if (contents.length === 0) {
              candidates.push({
                rel: `${rel}/`,
                abs,
                size: 0,
                mode: 0o40000 | (info.mode & 0o777),
                sourcePath: relativePath,
                decision: resolved.selection.evaluate({ path: relativePath, kind: "directory" }),
                payload: new Uint8Array(),
                observed: { key: `${relativePath}/`, observation: { kind: "directory" } },
              });
            } else pending.push({ parent: relative, children: contents });
          } else if (info.type === "File") {
            const sourceBytes =
              options?.skillEnvelope === undefined && relativePath === manifestName
                ? yield* fs.readFile(abs)
                : undefined;
            const payload =
              sourceBytes === undefined ? undefined : yield* prepareManifest(sourceBytes);
            candidates.push({
              rel,
              abs,
              size: payload?.byteLength ?? Number(info.size),
              ...(payload === undefined ? {} : { payload }),
              mode: 0o100000 | (info.mode & 0o777),
              sourcePath: relativePath,
              decision: resolved.selection.evaluate({ path: relativePath, kind: "file" }),
              observed: {
                key: relativePath,
                observation: {
                  kind: "file",
                  executable: (info.mode & 0o111) !== 0,
                  ...(sourceBytes === undefined ? {} : { bytes: sourceBytes }),
                },
              },
            });
          } else {
            return yield* publishRefused({
              category: "validation",
              detail: `Cannot archive unsupported filesystem entry: ${rel}`,
            });
          }
        }
      }
      candidates.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
      return candidates;
    }).pipe(
      Effect.mapError((cause) =>
        cause instanceof OperationRefused
          ? cause
          : publishRefused({
              category: "validation",
              detail: "Failed to read a contained source payload for zip archive",
              cause,
            }),
      ),
    );

    const planned = files.map((file): ArchivePlanEntry => ({
      path: file.rel,
      ...(file.sourcePath === undefined ? {} : { sourcePath: file.sourcePath }),
      size: file.size,
      matchedPatterns: file.decision.matchedRules.map(({ pattern }) => pattern),
      ...(file.decision.decidingRule === undefined
        ? {}
        : { ruleOrigin: file.decision.decidingRule.origin }),
    }));
    const included = planned.filter((_, index) => files[index]?.decision.included === true);
    const excluded = planned.filter((_, index) => files[index]?.decision.included === false);
    const includedPaths = new Set(included.map((file) => file.path));
    const broken = excludedDistributionLinkTarget(
      files.map((file) => ({
        path: file.rel,
        included: file.decision.included,
        ...((file.mode & 0o170000) === 0o120000 && file.payload !== undefined
          ? { linkTarget: new TextDecoder().decode(file.payload) }
          : {}),
      })),
    );
    if (broken !== undefined) {
      return yield* publishRefused({
        category: "validation",
        detail:
          broken.kind === "excluded-target"
            ? `Retained link "${broken.path}" points to excluded content "${broken.target}".`
            : "Distribution link resolution exceeds the shared archive validation budget.",
      });
    }

    const contents = yield* Effect.forEach(
      files.filter((file) => includedPaths.has(file.rel)),
      ({ rel, abs, payload, mode }) =>
        (payload === undefined
          ? Effect.suspend(() => {
              // Only a regular file the walk classified itself has no payload.
              const supplied = takeSourceBytes?.(abs);
              return supplied === undefined ? fs.readFile(abs) : Effect.succeed(supplied);
            })
          : Effect.succeed(payload)
        ).pipe(Effect.map((bytes) => [rel, bytes, mode] as const)),
      { concurrency: READ_CONCURRENCY },
    ).pipe(
      Effect.mapError((cause) =>
        publishRefused({
          category: "internal",
          detail: "Failed to read file for zip archive",
          cause,
        }),
      ),
    );

    // The walk's own observations, keyed by source path, until the caller's
    // comparison takes each one; nothing else holds the bytes after zipping.
    const observations = new Map<string, SourceObservation>();
    if (observeSources) {
      // An included regular file's raw bytes are the ones zipped; the
      // manifest's are the ones read before its distribution copy was made.
      const archived = new Map(contents.map(([rel, bytes]) => [rel, bytes]));
      for (const { observed, rel, decision } of files) {
        if (observed === undefined) continue;
        const { observation } = observed;
        const bytes =
          observation.kind === "file" && observation.bytes === undefined && decision.included
            ? archived.get(rel)
            : undefined;
        observations.set(
          observed.key,
          observation.kind === "file" && bytes !== undefined
            ? { ...observation, bytes }
            : observation,
        );
      }
    }
    const zippable: Zippable = {};
    for (const [rel, bytes, mode] of contents) {
      zippable[rel] = [bytes, { mtime: DETERMINISTIC_MTIME, os: 3, attrs: mode << 16 }];
    }

    const zipBytes = yield* Effect.try({
      // Registry ingest validates each entry independently. Stored entries
      // avoid decompressor-specific limits while retaining deterministic ZIP
      // bytes and bounded source-size accounting.
      try: () => zipSync(zippable, { mtime: DETERMINISTIC_MTIME, level: 0 }),
      catch: (cause) =>
        publishRefused({
          category: "internal",
          detail: "Failed to build zip archive",
          cause,
        }),
    });
    const patternPlans = resolved.selection.rules.map((rule) => ({
      pattern: rule.pattern,
      origin: rule.origin,
      matchCount: files.filter(({ decision }) => decision.matchedRules.includes(rule)).length,
    }));
    const explainedPatterns = patternPlans.filter(
      ({ matchCount, origin }) => matchCount !== 0 || origin.kind !== "gitignore",
    );
    return {
      zipBytes,
      ...(gitRoot === undefined ? {} : { gitRoot }),
      ...(observeSources
        ? {
            sourceObservations: {
              take: (key: string) => {
                const observation = observations.get(key);
                observations.delete(key);
                return observation;
              },
              release: () => observations.clear(),
            },
          }
        : {}),
      ...resolved,
      policyFingerprint: JSON.stringify({
        selection: resolved.policyFingerprint,
        manifest: manifestFingerprint,
      }),
      plan: {
        included,
        excluded,
        patterns: explainedPatterns,
        patternCoverage: {
          explicit: "all",
          inherited: "matched-only",
          omittedInheritedCount: patternPlans.length - explainedPatterns.length,
        },
        warnings: [
          ...warnings,
          ...patternPlans
            .filter(({ matchCount, origin }) => matchCount === 0 && origin.kind === "manifest")
            .map(
              ({ pattern, origin }) =>
                `publish.${origin.kind === "manifest" ? origin.field : "exclude"} pattern "${pattern}" matched no files.`,
            ),
        ],
        includedCount: included.length,
        excludedCount: excluded.length,
        uncompressedBytes: included.reduce((total, file) => total + file.size, 0),
      } satisfies ArchivePlan,
    };
  });

/**
 * Shared admission also resolves the virtual link graph, including links
 * whose targets change meaning after an earlier link and a '..' segment.
 * Admitting raw bytes copies them; an admitted archive is re-checked against
 * the default limits from its admitted facts.
 */
export const admitDistribution = (archive: Uint8Array | ValidatedArchive) =>
  validateArchive(archive).pipe(
    Effect.mapError((cause) =>
      publishRefused({
        category: "validation",
        detail: cause.message,
        cause,
      }),
    ),
  );

const planFromZip = (
  dir: string,
  options?: BuildZipArchiveOptions,
  takeSourceBytes?: TakeSourceBytes,
  observeSources = false,
) =>
  Effect.gen(function* () {
    const { zipBytes, gitRoot, sourceObservations, ...planned } = yield* zipDistribution(
      dir,
      options,
      takeSourceBytes,
      observeSources,
    );
    const archive = yield* admitDistribution(zipBytes);
    return {
      zipBytes,
      gitRoot,
      sourceObservations,
      planned: { archive, ...planned } satisfies PlannedZipArchive,
    };
  }).pipe(Effect.withSpan("axm.publish.archive"));

/**
 * Build a zip archive of a directory.
 * Files are stored at the root of the zip (no enclosing directory).
 * Empty directories have explicit entries; populated directories are implied by their children.
 */
export const planZipArchive = (dir: string, options?: BuildZipArchiveOptions) =>
  planFromZip(dir, options).pipe(Effect.map(({ planned }) => planned));

/**
 * Plan and admit a publication archive, also offering its digests over the
 * archive owner's own bytes so preparation needs no further copy. The
 * admitted archive is a copy of those bytes that is never mutated, so the
 * digests are the admitted archive's. `takeSourceBytes` may hand over source
 * bytes the preparation already read for an included regular file, which the
 * archive then uses instead of reading that file again. When the selection's
 * ignore discovery walked to a Git root, the preparation also receives the
 * root it found (none when it found none). The preparation also receives what
 * the walk observed of each source entry it examined itself, keyed by source
 * path ("/" ending an empty directory), to take once each or release.
 */
export const prepareZipArchive = (
  dir: string,
  options?: BuildZipArchiveOptions,
  takeSourceBytes?: TakeSourceBytes,
) =>
  planFromZip(dir, options, takeSourceBytes, true).pipe(
    Effect.map(({ zipBytes, gitRoot, sourceObservations, planned }) => ({
      ...planned,
      ...(gitRoot === undefined ? {} : { gitRoot }),
      ...(sourceObservations === undefined ? {} : { sourceObservations }),
      digests: () => ({
        integrity: sha512Integrity(zipBytes),
        sha256: archiveSha256Hex(zipBytes),
      }),
    })),
  );

/**
 * Rebuild a publication archive from current sources without admitting it:
 * the caller compares the digest and selection policy with what it prepared
 * and admits the rebuild only when it differs.
 */
export const rebuildDistributionDigest = (dir: string, options?: BuildZipArchiveOptions) =>
  zipDistribution(dir, options).pipe(
    Effect.map(({ zipBytes, policyFingerprint }) => ({
      integrity: sha512Integrity(zipBytes),
      policyFingerprint,
      admit: () => admitDistribution(zipBytes),
    })),
    Effect.withSpan("axm.publish.archive"),
  );
