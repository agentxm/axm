import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { parseFrontmatterEffect } from "../content/frontmatter.js";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { inspectKnowledgeEntries, type KnowledgeBundleEntry } from "../knowledge/okf.js";
import { readSubagentPackage } from "../content/subagent-content.js";
import type { ArchiveGuardrailError, ZipEntry } from "./archive-guardrails.js";
import type { ResolvedManifest } from "./manifest-policy.js";

/** A type-specific package invariant failed against the filtered archive. */
export class FilteredPackageError extends Data.TaggedError("FilteredPackageError")<{
  readonly code: "required_file_missing" | "content_invalid" | "reference_invalid";
  readonly detail: string;
  readonly path?: string;
}> {}

export interface ValidateFilteredPackageArgs {
  readonly type: ExtensionType;
  readonly entries: ReadonlyArray<ZipEntry>;
  readonly manifest: ResolvedManifest;
  readonly readEntry: (
    fileName: string,
  ) => Effect.Effect<Uint8Array, ArchiveGuardrailError | FilteredPackageError>;
}

const rawField = (raw: unknown, field: string): unknown =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? Reflect.get(raw, field)
    : undefined;

const safeArchivePath = (value: string): boolean =>
  value.length > 0 &&
  !value.startsWith("/") &&
  !value.includes("\\") &&
  !value.split("/").some((segment) => segment === "" || segment === "." || segment === "..");

const requireEntry = (
  entries: ReadonlyArray<ZipEntry>,
  path: string,
): Effect.Effect<ZipEntry, FilteredPackageError> => {
  const found = entries.find((entry) => entry.fileName === path);
  return found === undefined
    ? Effect.fail(
        new FilteredPackageError({
          code: "required_file_missing",
          detail: `Filtered ${path} is required by this package type.`,
          path,
        }),
      )
    : Effect.succeed(found);
};

const readText = (
  args: ValidateFilteredPackageArgs,
  path: string,
): Effect.Effect<string, FilteredPackageError> =>
  Effect.gen(function* () {
    yield* requireEntry(args.entries, path);
    const bytes = yield* args.readEntry(path).pipe(
      Effect.mapError(
        () =>
          new FilteredPackageError({
            code: "content_invalid",
            detail: `Could not read filtered package file "${path}".`,
            path,
          }),
      ),
    );
    return new TextDecoder().decode(bytes);
  });

/** Validate the complete type-specific package after Registry-only filtering. */
export const validateFilteredPackage = (
  args: ValidateFilteredPackageArgs,
): Effect.Effect<void, FilteredPackageError> =>
  Effect.gen(function* () {
    switch (args.type) {
      case "skill": {
        const path = "src/SKILL.md";
        // The envelope owns Registry identity. Authoring lint owns the chosen
        // frontmatter convention; ingest must not rewrite or reject upstream metadata.
        yield* readText(args, path);
        return;
      }
      case "subagent": {
        yield* readSubagentPackage({
          manifest: args.manifest.raw,
          readFile: (path) => readText(args, path),
        }).pipe(
          Effect.mapError((error) =>
            error instanceof FilteredPackageError
              ? error
              : new FilteredPackageError({
                  code:
                    error.reason === "reference-invalid" ? "reference_invalid" : "content_invalid",
                  detail: error.detail,
                  ...(error.source === undefined ? {} : { path: error.source }),
                }),
          ),
        );
        return;
      }
      case "rule": {
        const path = "src/RULE.md";
        const content = yield* readText(args, path);
        yield* parseFrontmatterEffect(content).pipe(
          Effect.mapError(
            () =>
              new FilteredPackageError({
                code: "content_invalid",
                detail: `Filtered "${path}" contains invalid frontmatter.`,
                path,
              }),
          ),
        );
        return;
      }
      case "hook": {
        const entrypoint = rawField(args.manifest.raw, "entrypoint");
        if (typeof entrypoint !== "string" || !safeArchivePath(entrypoint)) {
          return yield* new FilteredPackageError({
            code: "reference_invalid",
            detail: "Hook entrypoint must be a safe package-relative file path.",
          });
        }
        yield* requireEntry(args.entries, entrypoint);
        return;
      }
      case "knowledge": {
        if (rawField(args.manifest.raw, "bundleRoot") !== "src") {
          return yield* new FilteredPackageError({
            code: "reference_invalid",
            detail: "Knowledge bundleRoot must resolve to the filtered src directory.",
          });
        }
        yield* readText(args, "src/index.md");
        const sourcePrefix = "src/";
        const knowledgeEntries = args.entries
          .filter((entry) => entry.fileName.startsWith(sourcePrefix))
          .map<KnowledgeBundleEntry>((entry) => ({
            relativePath: entry.fileName.slice(sourcePrefix.length),
            type: "File",
            size: BigInt(entry.uncompressedSize),
          }));
        const inspection = yield* inspectKnowledgeEntries(knowledgeEntries, (relativePath) =>
          readText(args, `${sourcePrefix}${relativePath}`),
        );
        const errors = inspection.diagnostics.filter(
          (diagnostic) => diagnostic.severity === "error",
        );
        if (errors.length > 0) {
          return yield* new FilteredPackageError({
            code: "content_invalid",
            detail: `Filtered Knowledge bundle is invalid: ${errors
              .map((diagnostic) => `${diagnostic.relativePath}: ${diagnostic.message}`)
              .join("; ")}`,
          });
        }
        return;
      }
      case "mcp-server":
      case "pack":
        return;
    }
  });
