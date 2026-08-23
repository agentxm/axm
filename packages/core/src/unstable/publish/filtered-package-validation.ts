import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { parseFrontmatterEffect } from "../extensions/frontmatter.js";
import type { ExtensionType } from "../extensions/index.js";
import { parseSkillMd } from "../skills/skill-content.js";
import { parseSubagentMd } from "../subagents/subagent-content.js";
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
    const name = args.manifest.identity.name;
    switch (args.type) {
      case "skill": {
        const path = "src/SKILL.md";
        const content = yield* readText(args, path);
        if (Option.isNone(parseSkillMd(content, name))) {
          return yield* new FilteredPackageError({
            code: "content_invalid",
            detail: `Filtered "${path}" must contain valid Agent Skill frontmatter whose name is "${name}".`,
            path,
          });
        }
        return;
      }
      case "subagent": {
        const path = `src/${name}.md`;
        const content = yield* readText(args, path);
        yield* parseSubagentMd(content, name).pipe(
          Effect.mapError(
            () =>
              new FilteredPackageError({
                code: "content_invalid",
                detail: `Filtered "${path}" must contain valid subagent frontmatter whose name is "${name}".`,
                path,
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
        return;
      }
      case "mcp-server":
      case "pack":
        return;
    }
  });
