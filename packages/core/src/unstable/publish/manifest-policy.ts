import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import { CommandManifestSchema, COMMAND_MANIFEST_FILENAME } from "../commands/manifest-schema.js";
import {
  ManifestHandleSchema,
  ManifestNameSchema,
  ExtensionTypeSchema,
} from "../extensions/common.js";
import type { Handle } from "../extensions/handle.js";
import {
  McpServerManifestSchema,
  MCP_SERVER_MANIFEST_FILENAME,
} from "../mcp-servers/manifest-schema.js";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "../packs/manifest-schema.js";
import {
  SkillManifestSchema,
  MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME,
} from "../skills/manifest-schema.js";
import { ExactSemverVersionSchema } from "../version-constraints/index.js";
import type { ArchiveGuardrailError, ZipEntry } from "./archive-guardrails.js";

export class ManifestError extends Data.TaggedError("ManifestError")<{
  readonly code:
    | "manifest_missing"
    | "manifest_multiple"
    | "manifest_invalid_json"
    | "manifest_schema_invalid"
    | "declared_manifest_mismatch";
  readonly detail: string;
  readonly details?: unknown;
}> {}

export const manifestFilenameForType = (extensionType: string): string | undefined => {
  switch (extensionType) {
    case "skill":
      return SKILL_MANIFEST_FILENAME;
    case "command":
      return COMMAND_MANIFEST_FILENAME;
    case "mcp-server":
      return MCP_SERVER_MANIFEST_FILENAME;
    case "pack":
      return PACK_MANIFEST_FILENAME;
    default:
      return undefined;
  }
};

export const ManifestIdentitySchema = Schema.Struct({
  owner: ManifestHandleSchema,
  type: ExtensionTypeSchema,
  name: ManifestNameSchema,
  version: ExactSemverVersionSchema,
});

export type ManifestIdentity = Schema.Schema.Type<typeof ManifestIdentitySchema>;

export const manifestSchemaForType = (extensionType: string) => {
  switch (extensionType) {
    case "skill":
      return SkillManifestSchema;
    case "command":
      return CommandManifestSchema;
    case "mcp-server":
      return McpServerManifestSchema;
    case "pack":
      return PackManifestSchema;
    default:
      return undefined;
  }
};

export interface ManifestResolutionInput {
  readonly extensionType: string;
  readonly entries: readonly ZipEntry[];
  readonly readEntry: (fileName: string) => Effect.Effect<Uint8Array, ArchiveGuardrailError>;
}

export interface DeclaredPublishIdentity {
  readonly owner: Handle;
  readonly extensionType: string;
  readonly name: string;
  readonly version: string;
}

export interface ResolvedManifest {
  readonly identity: ManifestIdentity;
  readonly raw: unknown;
  readonly fileName: string;
}

export const resolveManifest = (
  input: ManifestResolutionInput,
): Effect.Effect<ResolvedManifest, ManifestError | ArchiveGuardrailError> =>
  Effect.gen(function* () {
    const expectedFilename = manifestFilenameForType(input.extensionType);
    if (expectedFilename === undefined) {
      return yield* new ManifestError({
        code: "manifest_missing",
        detail: `No manifest filename policy for extension type "${input.extensionType}".`,
      });
    }

    const [manifestEntry, ...rest] = input.entries.filter((entry) => {
      const normalized = entry.fileName.replace(/\\/g, "/");
      return (
        normalized === expectedFilename ||
        normalized.toLowerCase() === expectedFilename.toLowerCase()
      );
    });

    if (manifestEntry === undefined) {
      return yield* new ManifestError({
        code: "manifest_missing",
        detail: `Expected manifest file "${expectedFilename}" not found in archive root.`,
      });
    }

    if (rest.length > 0) {
      const allCandidates = [manifestEntry, ...rest];
      return yield* new ManifestError({
        code: "manifest_multiple",
        detail: `Multiple manifest candidates found for type "${input.extensionType}": ${allCandidates.map((candidate) => candidate.fileName).join(", ")}.`,
      });
    }

    const rawBytes = yield* input.readEntry(manifestEntry.fileName);
    const text = new TextDecoder().decode(rawBytes);

    const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
      Effect.mapError(
        () =>
          new ManifestError({
            code: "manifest_invalid_json",
            detail: `Manifest file "${manifestEntry.fileName}" contains invalid JSON.`,
          }),
      ),
    );

    const schema = manifestSchemaForType(input.extensionType);
    if (schema !== undefined) {
      yield* Schema.decodeUnknownEffect(schema)(parsed).pipe(
        Effect.mapError(
          (error) =>
            new ManifestError({
              code: "manifest_schema_invalid",
              detail: `Manifest file "${manifestEntry.fileName}" does not conform to the ${input.extensionType} manifest schema.`,
              details: SchemaIssue.makeFormatterDefault()(error.issue),
            }),
        ),
      );
    }

    const identity = yield* Schema.decodeUnknownEffect(ManifestIdentitySchema)(parsed).pipe(
      Effect.mapError(
        () =>
          new ManifestError({
            code: "manifest_schema_invalid",
            detail: `Manifest file "${manifestEntry.fileName}" is missing required identity fields (owner, type, name, version).`,
          }),
      ),
    );

    return {
      identity,
      raw: parsed,
      fileName: manifestEntry.fileName,
    };
  });

export const validateDeclaredManifestAlignment = (
  declaredIdentity: DeclaredPublishIdentity,
  manifest: ManifestIdentity,
): Result.Result<void, ManifestError> => {
  const mismatches: string[] = [];

  if (declaredIdentity.name !== manifest.name) {
    mismatches.push(`name: declared="${declaredIdentity.name}" manifest="${manifest.name}"`);
  }
  if (declaredIdentity.owner !== manifest.owner) {
    mismatches.push(`owner: declared="${declaredIdentity.owner}" manifest="${manifest.owner}"`);
  }
  if (declaredIdentity.extensionType !== manifest.type) {
    mismatches.push(
      `type: declared="${declaredIdentity.extensionType}" manifest="${manifest.type}"`,
    );
  }
  if (declaredIdentity.version !== manifest.version) {
    mismatches.push(
      `version: declared="${declaredIdentity.version}" manifest="${manifest.version}"`,
    );
  }

  if (mismatches.length > 0) {
    return Result.fail(
      new ManifestError({
        code: "declared_manifest_mismatch",
        detail: `Declared publish identity and manifest identity disagree: ${mismatches.join(", ")}.`,
        details: { declaredIdentity, manifest },
      }),
    );
  }

  return Result.void;
};
