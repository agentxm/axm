// @effect-diagnostics anyUnknownInErrorContext:off — lint accepts opaque OKF accessor errors only at its diagnostic boundary
/**
 * Validate Open Knowledge Format bundles without changing them.
 *
 * The caller selects either the installed corpus (all bundles, or one by
 * name) or a locally authored package directory — never both. The verdict is
 * a typed report: every diagnostic located by bundle and path, and validity
 * decided by whether any diagnostic is an error.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import {
  inspectKnowledgePackage,
  type KnowledgeDiagnostic,
} from "@agentxm/extension-content/knowledge";
import {
  InstalledKnowledgeUnavailable,
  selectInstalledKnowledgeBundles,
} from "@agentxm/workspace-projection";
import { WorkspaceLocation } from "@agentxm/workspace-state";

import type { KnowledgeLintQueryResult } from "../documents.js";
import { KnowledgeCorpusUnavailable, KnowledgeRequestInvalid } from "../errors.js";

export interface LintKnowledgeRequest {
  /** One installed bundle by name; omit for every installed bundle. */
  readonly bundle?: string;
  /** A locally authored Knowledge package directory, relative to the workspace. */
  readonly packagePath?: string;
}

interface InspectedBundle {
  readonly name: string;
  readonly inspection: { readonly diagnostics: ReadonlyArray<KnowledgeDiagnostic> };
}

/** One installed or authored bundle's diagnostics, tagged with its bundle name. */
const flatten = (bundles: ReadonlyArray<InspectedBundle>) =>
  bundles.flatMap(({ name, inspection }) =>
    inspection.diagnostics.map((item) => ({ bundle: name, ...item })),
  );

const inspectAuthored = Effect.fn("Knowledge.lintAuthored")(function* (packagePath: string) {
  const location = yield* WorkspaceLocation;
  const path = yield* Path.Path;
  const inspected = yield* inspectKnowledgePackage(
    path.resolve(location.baseDir, packagePath),
  ).pipe(
    Effect.mapError(
      (cause) =>
        new KnowledgeCorpusUnavailable({
          reason: "source-unreadable",
          detail: `Failed to inspect authored Knowledge package ${packagePath}`,
          cause,
        }),
    ),
  );
  return [inspected];
});

const inspectInstalled = Effect.fn("Knowledge.lintInstalled")(function* (bundle?: string) {
  const selected = yield* selectInstalledKnowledgeBundles(
    bundle === undefined ? undefined : { name: bundle },
  ).pipe(
    Effect.catchTag("InstalledKnowledgeUnavailable", (failure: InstalledKnowledgeUnavailable) =>
      Effect.fail(
        new KnowledgeCorpusUnavailable({
          reason: failure.reason,
          detail: failure.detail,
          ...(failure.bundle === undefined ? {} : { bundle: failure.bundle }),
        }),
      ),
    ),
  );
  return yield* Effect.forEach(
    selected,
    (entry) =>
      inspectKnowledgePackage(entry.packageRoot).pipe(
        Effect.map((inspected) => ({ ...inspected, name: entry.name })),
        Effect.mapError(
          (cause) =>
            new KnowledgeCorpusUnavailable({
              reason: "source-unreadable",
              detail: `Failed to inspect knowledge bundle "${entry.name}"`,
              bundle: entry.name,
              cause,
            }),
        ),
      ),
    { concurrency: "unbounded" },
  );
});

export interface LintKnowledgeResult {
  readonly document: KnowledgeLintQueryResult;
  /** How many bundles were validated, for the success sentence. */
  readonly bundleCount: number;
  /** Diagnostics of error severity; a non-empty list means the verdict is invalid. */
  readonly errorCount: number;
}

/** Validate the selected installed bundles, or one authored package. */
export const lintKnowledge = Effect.fn("Knowledge.lint")(function* (request: LintKnowledgeRequest) {
  if (request.bundle !== undefined && request.packagePath !== undefined) {
    return yield* new KnowledgeRequestInvalid({
      detail: "Choose either an installed bundle name or --path, not both",
    });
  }
  const bundles =
    request.packagePath === undefined
      ? yield* inspectInstalled(request.bundle)
      : yield* inspectAuthored(request.packagePath);
  const diagnostics = flatten(bundles);
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  return {
    document: { valid: errorCount === 0, diagnostics },
    bundleCount: bundles.length,
    errorCount,
  } satisfies LintKnowledgeResult;
});
