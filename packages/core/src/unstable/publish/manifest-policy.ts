import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import { CommandManifestSchema, COMMAND_MANIFEST_FILENAME } from "../commands/manifest-schema.js";
import {
  ExtensionNameSchema,
  ExtensionTypeSchema,
  type ExtensionName,
  type ExtensionType,
} from "../extensions/common.js";
import { ContextManifestSchema, CONTEXT_MANIFEST_FILENAME } from "../context/manifest-schema.js";
import { HandleSchema, type Handle } from "../extensions/handle.js";
import {
  McpServerManifestSchema,
  MCP_SERVER_MANIFEST_FILENAME,
} from "../mcp-servers/manifest-schema.js";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "../packs/manifest-schema.js";
import {
  SkillManifestSchema,
  MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME,
} from "../skills/manifest-schema.js";
import {
  SubagentManifestSchema,
  MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME,
} from "../subagents/manifest-schema.js";
import { VersionSchema, type Version } from "../version-constraints/version-constraints.js";
import type { ArchiveGuardrailError, ZipEntry } from "./archive-guardrails.js";

export class ManifestError extends Data.TaggedError("ManifestError")<{
  readonly code:
    | "manifest_missing"
    | "manifest_multiple"
    | "manifest_invalid_json"
    | "manifest_schema_invalid"
    | "companion_package_purl_has_version"
    | "companion_package_scheme_mismatch"
    | "companion_package_invalid"
    | "declared_manifest_mismatch";
  readonly detail: string;
  readonly details?: unknown;
}> {}

export const manifestFilenameForType = (type: string): string | undefined => {
  switch (type) {
    case "skill":
      return SKILL_MANIFEST_FILENAME;
    case "command":
      return COMMAND_MANIFEST_FILENAME;
    case "mcp-server":
      return MCP_SERVER_MANIFEST_FILENAME;
    case "subagent":
      return SUBAGENT_MANIFEST_FILENAME;
    case "pack":
      return PACK_MANIFEST_FILENAME;
    case "context":
      return CONTEXT_MANIFEST_FILENAME;
    default:
      return undefined;
  }
};

export const ManifestIdentitySchema = Schema.Struct({
  owner: HandleSchema.pipe(Schema.annotateKey({ messageMissingKey: "owner is required" })),
  type: ExtensionTypeSchema.pipe(Schema.annotateKey({ messageMissingKey: "type is required" })),
  name: ExtensionNameSchema.pipe(Schema.annotateKey({ messageMissingKey: "name is required" })),
  version: VersionSchema.pipe(Schema.annotateKey({ messageMissingKey: "version is required" })),
}).annotate({
  identifier: "ManifestIdentity",
  title: "Manifest Identity",
  description:
    "The key identity fields from a manifest: who owns it, what type, its name, and version.",
});

export type ManifestIdentity = Schema.Schema.Type<typeof ManifestIdentitySchema>;

export const manifestSchemaForType = (type: string) => {
  switch (type) {
    case "skill":
      return SkillManifestSchema;
    case "command":
      return CommandManifestSchema;
    case "mcp-server":
      return McpServerManifestSchema;
    case "subagent":
      return SubagentManifestSchema;
    case "pack":
      return PackManifestSchema;
    case "context":
      return ContextManifestSchema;
    default:
      return undefined;
  }
};

export interface ManifestResolutionInput {
  readonly type: string;
  readonly entries: readonly ZipEntry[];
  readonly readEntry: (fileName: string) => Effect.Effect<Uint8Array, ArchiveGuardrailError>;
}

export interface DeclaredPublishIdentity {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}

export interface ResolvedManifest {
  readonly identity: ManifestIdentity;
  readonly raw: unknown;
  readonly fileName: string;
}

const hasOwnField = (value: unknown, field: string): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.hasOwn(value, field);

const purlHasVersion = (value: string): boolean => {
  const queryStart = value.search(/[?#]/);
  const comparable = queryStart === -1 ? value : value.slice(0, queryStart);
  const lastSlash = comparable.lastIndexOf("/");
  return lastSlash >= 0 && comparable.indexOf("@", lastSlash + 1) !== -1;
};

const purlType = (value: string): string | undefined => {
  const match = /^pkg:([^/]+)\//i.exec(value);
  return match?.[1]?.toLowerCase();
};

const versScheme = (value: string): string | undefined => {
  const match = /^vers:([^/]+)\//i.exec(value);
  return match?.[1]?.toLowerCase();
};

const classifyCompanionPackageManifestError = (
  raw: unknown,
): { readonly code: ManifestError["code"]; readonly detail: string } | undefined => {
  if (typeof raw !== "object" || raw === null || !("packages" in raw)) {
    return undefined;
  }

  const packages = Reflect.get(raw, "packages");
  if (!Array.isArray(packages)) {
    return {
      code: "companion_package_invalid",
      detail: "Manifest packages must be an array of companion package objects.",
    };
  }

  for (const entry of packages) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return {
        code: "companion_package_invalid",
        detail:
          "Manifest packages entries must be objects with purl and optional versionRange fields.",
      };
    }

    const purl = Reflect.get(entry, "purl");
    if (typeof purl !== "string") {
      return {
        code: "companion_package_invalid",
        detail: "Manifest packages entries must include a purl string.",
      };
    }

    if (purlHasVersion(purl)) {
      return {
        code: "companion_package_purl_has_version",
        detail:
          "Companion package purls are identities, not pins. Move versions into versionRange.",
      };
    }

    const versionRange = Reflect.get(entry, "versionRange");
    if (versionRange !== undefined && typeof versionRange !== "string") {
      return {
        code: "companion_package_invalid",
        detail: "Manifest packages versionRange must be a VERS string.",
      };
    }

    const packageType = purlType(purl);
    const rangeScheme = typeof versionRange === "string" ? versScheme(versionRange) : undefined;
    if (packageType !== undefined && rangeScheme !== undefined && packageType !== rangeScheme) {
      return {
        code: "companion_package_scheme_mismatch",
        detail: "Companion package purl ecosystem must match the versionRange VERS scheme.",
      };
    }
  }

  return {
    code: "companion_package_invalid",
    detail: "Manifest packages contains an invalid companion package declaration.",
  };
};

export const validateManifestHasNoAgentsField = (
  fileName: string,
  raw: unknown,
): Result.Result<void, ManifestError> => {
  if (!hasOwnField(raw, "agents")) return Result.void;

  return Result.fail(
    new ManifestError({
      code: "manifest_schema_invalid",
      detail: `Manifest file "${fileName}" must not include "agents"; express targeting in settings.agents.`,
    }),
  );
};

export const validateCommandManifestHasNoAgentOverridesField = (
  fileName: string,
  raw: unknown,
): Result.Result<void, ManifestError> => {
  if (!hasOwnField(raw, "agentOverrides")) return Result.void;

  return Result.fail(
    new ManifestError({
      code: "manifest_schema_invalid",
      detail: `Manifest file "${fileName}" must not include "agentOverrides"; move agentOverrides to the command content file frontmatter.`,
    }),
  );
};

export const resolveManifest = (
  input: ManifestResolutionInput,
): Effect.Effect<ResolvedManifest, ManifestError | ArchiveGuardrailError> =>
  Effect.gen(function* () {
    const expectedFilename = manifestFilenameForType(input.type);
    if (expectedFilename === undefined) {
      return yield* new ManifestError({
        code: "manifest_missing",
        detail: `No manifest filename policy for extension type "${input.type}".`,
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
        detail: `Multiple manifest candidates found for type "${input.type}": ${allCandidates.map((candidate) => candidate.fileName).join(", ")}.`,
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

    yield* validateManifestHasNoAgentsField(manifestEntry.fileName, parsed);
    if (input.type === "command") {
      yield* validateCommandManifestHasNoAgentOverridesField(manifestEntry.fileName, parsed);
    }

    const schema = manifestSchemaForType(input.type);
    if (schema !== undefined) {
      yield* Schema.decodeUnknownEffect(schema)(parsed).pipe(
        Effect.mapError((error) => {
          const companionPackageError = classifyCompanionPackageManifestError(parsed);
          return new ManifestError({
            code: companionPackageError?.code ?? "manifest_schema_invalid",
            detail:
              companionPackageError?.detail ??
              `Manifest file "${manifestEntry.fileName}" does not conform to the ${input.type} manifest schema.`,
            details: SchemaIssue.makeFormatterDefault()(error.issue),
          });
        }),
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
  if (declaredIdentity.type !== manifest.type) {
    mismatches.push(`type: declared="${declaredIdentity.type}" manifest="${manifest.type}"`);
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
