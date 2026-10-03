/** Native definition parsing and package selection shared by every subagent workflow. */
// @effect-diagnostics anyUnknownInErrorContext:off — package readers preserve caller-owned read errors
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { parse as parseToml } from "smol-toml";
import {
  MANIFEST_FILENAME,
  SubagentManifestSchema,
  SubagentNativeNameSchema,
  type SubagentManifest,
} from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { parseFrontmatterEffect } from "./frontmatter.js";

export class SubagentContentError extends Data.TaggedError("SubagentContentError")<{
  readonly reason: "manifest-invalid" | "reference-invalid" | "content-invalid" | "native-invalid";
  readonly detail: string;
  readonly source?: string;
  readonly cause?: unknown;
}> {}

export interface NativeSubagentContent {
  readonly format: "markdown" | "toml" | "json";
  /** Exact author-supplied native source; AXM never merges a core into it. */
  readonly content: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly description?: string;
  readonly instructions: string;
}

const nativeFormats: Readonly<Record<string, NativeSubagentContent["format"]>> = {
  antigravity: "markdown",
  "antigravity-cli": "markdown",
  "claude-code": "markdown",
  "github-copilot-cli": "markdown",
  cursor: "markdown",
  "gemini-cli": "markdown",
  opencode: "markdown",
  augment: "markdown",
  junie: "markdown",
  kilo: "markdown",
  "kimi-cli": "markdown",
  codebuddy: "markdown",
  "mimo-code": "markdown",
  kode: "markdown",
  "codearts-agent": "markdown",
  "iflow-cli": "markdown",
  rovodev: "markdown",
  "qwen-code": "markdown",
  qoder: "markdown",
  "qoder-cn": "markdown",
  "grok-cli": "markdown",
  "command-code": "markdown",
  mux: "markdown",
  devin: "markdown",
  codex: "toml",
  "mistral-vibe": "toml",
  "kiro-cli": "json",
  roo: "json",
};

/** Known native syntax, independent of AXM's scope, ownership, or writer support. */
export const nativeSubagentFormat = (
  agentId: string,
): NativeSubagentContent["format"] | undefined => nativeFormats[agentId];

export type ResolvedSubagentImplementation =
  | {
      readonly kind: "customized";
      readonly configuration: Readonly<Record<string, unknown>>;
      readonly instructions?: {
        readonly mode: "append" | "replace";
        readonly source: string;
        readonly content: string;
      };
    }
  | { readonly kind: "native"; readonly source: string; readonly native: NativeSubagentContent };

export interface DecodedSubagentPackage {
  readonly manifest: SubagentManifest;
  readonly core?: {
    readonly name: string;
    readonly description: string;
    readonly instructions: string;
    readonly source: string;
  };
  readonly implementations: Readonly<Record<string, ResolvedSubagentImplementation>>;
}

export type SelectedSubagentImplementation =
  | {
      readonly kind: "core" | "customized";
      readonly name: string;
      readonly description: string;
      readonly instructions: string;
      readonly configuration: Readonly<Record<string, unknown>>;
      readonly sourceDependencies: ReadonlyArray<string>;
    }
  | {
      readonly kind: "native";
      readonly source: string;
      readonly native: NativeSubagentContent;
      readonly sourceDependencies: ReadonlyArray<string>;
    }
  | {
      readonly kind: "unsupported";
      readonly reason: string;
      readonly sourceDependencies: ReadonlyArray<string>;
    };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reject dangerous object keys, including nested keys, before downstream merging. */
const hasUnsafeKeys = (value: unknown, seen = new Set<object>()): boolean => {
  if (typeof value !== "object" || value === null) return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const unsafe = Object.entries(value).some(
    ([key, child]) =>
      ["__proto__", "prototype", "constructor", "agentOverrides"].includes(key) ||
      hasUnsafeKeys(child, seen),
  );
  seen.delete(value);
  return unsafe;
};

/** Parse a complete native definition without discarding unknown native fields. */
export const parseNativeSubagent = (args: {
  readonly agentId: string;
  readonly source: string;
  readonly content: string;
}): Effect.Effect<NativeSubagentContent, SubagentContentError> =>
  Effect.gen(function* () {
    const invalid = (detail: string) =>
      new SubagentContentError({
        reason: "native-invalid",
        source: args.source,
        detail,
      });
    const extension = args.source.split(".").at(-1)?.toLowerCase();
    const format =
      extension === "md"
        ? "markdown"
        : extension === "toml"
          ? "toml"
          : extension === "json"
            ? "json"
            : undefined;
    if (format === undefined) {
      return yield* invalid(`Native source "${args.source}" must be Markdown, TOML, or JSON.`);
    }
    const expectedFormat = nativeSubagentFormat(args.agentId);
    if (expectedFormat !== undefined && expectedFormat !== format) {
      return yield* invalid(
        `Native source "${args.source}" must use ${expectedFormat} for ${args.agentId}.`,
      );
    }
    let configuration: Readonly<Record<string, unknown>>;
    let instructions: string;
    if (format === "markdown") {
      const parsed = yield* parseFrontmatterEffect(args.content).pipe(
        Effect.mapError(() =>
          invalid(`Native source "${args.source}" has invalid YAML frontmatter.`),
        ),
      );
      if (!isRecord(parsed.frontmatter)) {
        return yield* invalid(
          `Native source "${args.source}" requires an object frontmatter block.`,
        );
      }
      configuration = parsed.frontmatter;
      instructions = parsed.body;
    } else {
      const parsed: unknown = yield* Effect.try({
        try: (): unknown =>
          format === "toml" ? parseToml(args.content) : JSON.parse(args.content),
        catch: () =>
          invalid(`Native source "${args.source}" is not valid ${format.toUpperCase()}.`),
      });
      if (!isRecord(parsed))
        return yield* invalid(`Native source "${args.source}" must be an object.`);
      configuration = parsed;
      const instructionKey =
        format === "toml"
          ? args.agentId === "codex"
            ? "developer_instructions"
            : "system_prompt"
          : "prompt";
      const value = parsed[instructionKey];
      if (value !== undefined && typeof value !== "string") {
        return yield* invalid(
          `Native source "${args.source}" requires a string ${instructionKey}.`,
        );
      }
      instructions = typeof value === "string" ? value : "";
    }
    if (hasUnsafeKeys(configuration)) {
      return yield* invalid(
        `Native source "${args.source}" contains unsafe or obsolete object keys.`,
      );
    }
    if (args.agentId === "codex" || args.agentId === "claude-code") {
      const required =
        args.agentId === "codex"
          ? ["name", "description", "developer_instructions"]
          : ["name", "description"];
      for (const key of required) {
        const value = configuration[key];
        if (typeof value !== "string" || value.trim().length === 0) {
          return yield* invalid(
            `Native source "${args.source}" requires nonempty ${key} for ${args.agentId}.`,
          );
        }
      }
    }
    if (args.agentId === "mistral-vibe" && configuration["agent_type"] !== "subagent") {
      return yield* invalid(`Native source "${args.source}" requires agent_type = "subagent".`);
    }
    const stem = args.source
      .split("/")
      .at(-1)
      ?.replace(/\.[^.]+$/, "");
    const nativeName =
      args.agentId === "opencode" || args.agentId === "mistral-vibe"
        ? stem
        : (configuration["name"] ?? stem);
    const name = yield* Schema.decodeUnknownEffect(SubagentNativeNameSchema)(nativeName).pipe(
      Effect.mapError(() => invalid(`Native source "${args.source}" requires a safe native name.`)),
    );
    const description = configuration["description"];
    if (description !== undefined && typeof description !== "string") {
      return yield* invalid(`Native source "${args.source}" requires a string description.`);
    }
    return {
      format,
      content: args.content,
      configuration,
      name,
      instructions,
      ...(description === undefined ? {} : { description }),
    };
  });

/** Validate and resolve every declared compile-time input using a package-contained reader. */
export const readSubagentPackage = <E, R>(args: {
  readonly manifest: unknown;
  readonly readFile: (relativePath: string) => Effect.Effect<string, E, R>;
}): Effect.Effect<DecodedSubagentPackage, SubagentContentError | E, R> =>
  Effect.gen(function* () {
    const manifest = yield* Schema.decodeUnknownEffect(SubagentManifestSchema, {
      onExcessProperty: "error",
    })(args.manifest).pipe(
      Effect.mapError(
        (cause) =>
          new SubagentContentError({
            reason: "manifest-invalid",
            detail: "Invalid subagent package manifest.",
            cause,
          }),
      ),
    );
    const core =
      manifest.core === undefined
        ? undefined
        : {
            name: manifest.core.name ?? manifest.name,
            description: manifest.description ?? "",
            instructions: yield* args.readFile(manifest.core.instructions),
            source: manifest.core.instructions,
          };
    const entries = yield* Effect.forEach(
      Object.entries(manifest.implementations ?? {}),
      ([agentId, implementation]) =>
        Effect.gen(function* () {
          let resolved: ResolvedSubagentImplementation;
          if (implementation.kind === "native") {
            const content = yield* args.readFile(implementation.source);
            const native = yield* parseNativeSubagent({
              agentId,
              source: implementation.source,
              content,
            });
            resolved = { kind: "native", source: implementation.source, native };
          } else {
            if (hasUnsafeKeys(implementation.configuration)) {
              return yield* new SubagentContentError({
                reason: "manifest-invalid",
                detail: `Implementation "${agentId}" contains unsafe configuration keys.`,
              });
            }
            const instructions =
              implementation.instructions === undefined
                ? undefined
                : {
                    ...implementation.instructions,
                    content: yield* args.readFile(implementation.instructions.source),
                  };
            resolved = {
              kind: "customized",
              configuration: implementation.configuration ?? {},
              ...(instructions === undefined ? {} : { instructions }),
            };
          }
          return [agentId, resolved] as const;
        }),
    );
    return {
      manifest,
      ...(core === undefined ? {} : { core }),
      implementations: Object.fromEntries(entries),
    };
  });

/** Read regular source files only after resolving them inside the owning package. */
export const loadSubagentPackage = (
  packageRoot: string,
): Effect.Effect<DecodedSubagentPackage, SubagentContentError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const realRoot = yield* fs.realPath(packageRoot).pipe(
      Effect.mapError(
        (cause) =>
          new SubagentContentError({
            reason: "reference-invalid",
            detail: "Subagent package root could not be resolved.",
            cause,
          }),
      ),
    );
    const readFile = (source: string) =>
      Effect.gen(function* () {
        const sourcePath = path.join(realRoot, source);
        const realSource = yield* fs.realPath(sourcePath);
        const relative = path.relative(realRoot, realSource);
        if (
          relative === "" ||
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        ) {
          return yield* new SubagentContentError({
            reason: "reference-invalid",
            source,
            detail: `Source "${source}" escapes its package.`,
          });
        }
        const info = yield* fs.stat(realSource);
        if (info.type !== "File") {
          return yield* new SubagentContentError({
            reason: "reference-invalid",
            source,
            detail: `Source "${source}" must be a regular file.`,
          });
        }
        return yield* fs.readFileString(realSource);
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof SubagentContentError
            ? cause
            : new SubagentContentError({
                reason: "reference-invalid",
                source,
                detail: `Source "${source}" could not be read.`,
                cause,
              }),
        ),
      );
    const manifestSource = yield* readFile(MANIFEST_FILENAME);
    const manifest: unknown = yield* Effect.try({
      try: (): unknown => JSON.parse(manifestSource),
      catch: () =>
        new SubagentContentError({
          reason: "manifest-invalid",
          source: MANIFEST_FILENAME,
          detail: "Subagent manifest must contain valid JSON.",
        }),
    });
    return yield* readSubagentPackage({ manifest, readFile });
  });

/** Select one explicit implementation; a complete native definition bypasses the core. */
export const selectSubagentImplementation = (
  pkg: DecodedSubagentPackage,
  agentId: string,
): SelectedSubagentImplementation => {
  const implementation = pkg.implementations[agentId];
  if (implementation?.kind === "native") {
    return { ...implementation, sourceDependencies: [MANIFEST_FILENAME, implementation.source] };
  }
  const core = pkg.core;
  if (core === undefined) {
    return {
      kind: "unsupported",
      reason: `This package has no implementation for ${agentId}.`,
      sourceDependencies: [MANIFEST_FILENAME],
    };
  }
  const customization = implementation?.kind === "customized" ? implementation : undefined;
  const replacement = customization?.instructions;
  const instructions =
    replacement === undefined
      ? core.instructions
      : replacement.mode === "replace"
        ? replacement.content
        : `${core.instructions}\n\n${replacement.content}`;
  return {
    kind: customization === undefined ? "core" : "customized",
    name: core.name,
    description: core.description,
    instructions,
    configuration: customization?.configuration ?? {},
    sourceDependencies: [
      ...new Set([
        MANIFEST_FILENAME,
        ...(replacement?.mode === "replace" ? [] : [core.source]),
        ...(replacement === undefined ? [] : [replacement.source]),
      ]),
    ],
  };
};
