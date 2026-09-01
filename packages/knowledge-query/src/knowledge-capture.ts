// @effect-diagnostics anyUnknownInErrorContext:off — corpus readers deliberately preserve caller-owned foreign read errors
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { KnowledgeBundleFqn } from "@agentxm/extension-model/unstable/knowledge/concept-ref";
import type { KnowledgeIndexBundleInput } from "./knowledge-index.js";
import {
  captureKnowledgeCorpus,
  type CapturedKnowledgeSource,
  type KnowledgeCorpusChangingError,
  type KnowledgeCorpusSource,
} from "./knowledge-revision.js";
import {
  collectKnowledgeBundleEntries,
  inspectKnowledgeEntries,
  type KnowledgeBundleEntry,
} from "@agentxm/registry-protocol/unstable/knowledge/okf";

export interface KnowledgeBundleCaptureDescriptor {
  readonly bundle: KnowledgeBundleFqn;
  readonly version: string;
  readonly sourceRoot: string;
}

interface PreparedBundleCapture extends KnowledgeBundleCaptureDescriptor {
  readonly entries: ReadonlyArray<KnowledgeBundleEntry>;
}

export class KnowledgeCapturedSourceMissingError extends Data.TaggedError(
  "KnowledgeCapturedSourceMissingError",
)<{
  readonly bundle: string;
  readonly relativePath: string;
}> {}

const sourceKey = (bundle: string, relativePath: string): string =>
  `${bundle.length}:${bundle}${relativePath.length}:${relativePath}`;

/**
 * Capture and parse all selected bundles from the same double-read corpus view.
 * Absolute roots are used only for I/O and never enter revisions or results.
 */
export const captureKnowledgeIndexBundles = (
  descriptors: ReadonlyArray<KnowledgeBundleCaptureDescriptor>,
  options?: { readonly maxAttempts?: number },
): Effect.Effect<
  ReadonlyArray<KnowledgeIndexBundleInput>,
  unknown | KnowledgeCorpusChangingError | KnowledgeCapturedSourceMissingError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const prepared: ReadonlyArray<PreparedBundleCapture> = yield* Effect.forEach(
      [...descriptors].sort((left, right) => left.bundle.localeCompare(right.bundle)),
      (descriptor) =>
        collectKnowledgeBundleEntries(descriptor.sourceRoot).pipe(
          Effect.map((entries) => ({ ...descriptor, entries })),
        ),
      { concurrency: 16 },
    );
    const roots = new Map(prepared.map((descriptor) => [descriptor.bundle, descriptor.sourceRoot]));
    const corpusSources = prepared.flatMap((descriptor) =>
      descriptor.entries
        .filter((entry) => entry.type === "File")
        .map((entry) => ({ bundle: descriptor.bundle, relativePath: entry.relativePath })),
    );
    const readSource = (source: KnowledgeCorpusSource): Effect.Effect<Uint8Array, unknown> => {
      const root = roots.get(source.bundle);
      return root === undefined
        ? Effect.fail(
            new KnowledgeCapturedSourceMissingError({
              bundle: source.bundle,
              relativePath: source.relativePath,
            }),
          )
        : fs.readFile(path.join(root, source.relativePath));
    };
    const captured = yield* captureKnowledgeCorpus(corpusSources, readSource, options);
    const byPath = new Map(
      captured.sources.map((source) => [sourceKey(source.bundle, source.relativePath), source]),
    );

    return yield* Effect.forEach(
      prepared,
      (descriptor) =>
        inspectKnowledgeEntries(descriptor.entries, (relativePath) => {
          const source = byPath.get(sourceKey(descriptor.bundle, relativePath));
          return source === undefined
            ? Effect.fail(
                new KnowledgeCapturedSourceMissingError({
                  bundle: descriptor.bundle,
                  relativePath,
                }),
              )
            : Effect.succeed(new TextDecoder().decode(source.bytes));
        }).pipe(
          Effect.map((inspection) => ({
            bundle: descriptor.bundle,
            version: descriptor.version,
            inspection,
            sources: captured.sources.filter(
              (source): source is CapturedKnowledgeSource => source.bundle === descriptor.bundle,
            ),
          })),
        ),
      { concurrency: 16 },
    );
  });
