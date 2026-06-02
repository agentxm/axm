/**
 * files manifest schema definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

/**
 * Filename for files manifests.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FILES_MANIFEST_FILENAME = "files.json";

/**
 * Local directory segment for files packages under `.axm/extensions`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FILES_EXTENSION_DIR = "files";

/**
 * URL for the files manifest JSON Schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FILES_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/files.schema.json";

/**
 * Scalar values accepted by files inputs and template substitution.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileInputValueSchema = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
]).annotate({
  identifier: "FilesInputValue",
  title: "Files Input Value",
  description: "Scalar value used to render files templates.",
});

/** @experimental */
export type FileInputValue = Schema.Schema.Type<typeof FileInputValueSchema>;

const FileInputStringDeclarationSchema = Schema.Struct({
  type: Schema.Literal("string"),
  prompt: Schema.optional(Schema.String),
  default: Schema.optional(Schema.String),
}).annotate({
  identifier: "FilesInputStringDeclaration",
  title: "Files Input String Declaration",
});

const FileInputNumberDeclarationSchema = Schema.Struct({
  type: Schema.Literal("number"),
  prompt: Schema.optional(Schema.String),
  default: Schema.optional(Schema.Number),
}).annotate({
  identifier: "FilesInputNumberDeclaration",
  title: "Files Input Number Declaration",
});

const FileInputBooleanDeclarationSchema = Schema.Struct({
  type: Schema.Literal("boolean"),
  prompt: Schema.optional(Schema.String),
  default: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "FilesInputBooleanDeclaration",
  title: "Files Input Boolean Declaration",
});

const FileInputEnumDeclarationSchema = Schema.Struct({
  type: Schema.Literal("enum"),
  prompt: Schema.optional(Schema.String),
  values: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  default: Schema.optional(Schema.String),
}).annotate({
  identifier: "FilesInputEnumDeclaration",
  title: "Files Input Enum Declaration",
});

/**
 * Input declaration for values consumed by template file sources.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileInputDeclarationSchema = Schema.Union([
  FileInputStringDeclarationSchema,
  FileInputNumberDeclarationSchema,
  FileInputBooleanDeclarationSchema,
  FileInputEnumDeclarationSchema,
]).annotate({
  identifier: "FilesInputDeclaration",
  title: "Files Input Declaration",
  description: "A scalar input declaration for a files template.",
});

/** @experimental */
export type FileInputDeclaration = Schema.Schema.Type<typeof FileInputDeclarationSchema>;

/**
 * Map of input names to input declarations.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileInputDeclarationsMapSchema = Schema.Record(
  Schema.String,
  FileInputDeclarationSchema,
).annotate({
  identifier: "FilesInputDeclarationsMap",
  title: "Files Input Declarations Map",
});

/** @experimental */
export type FileInputDeclarationsMap = Schema.Schema.Type<typeof FileInputDeclarationsMapSchema>;

/**
 * Generator spec used by generated file content sources.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileGeneratorSpecSchema = Schema.Struct({
  name: Schema.Literals(["toc", "file-index"]),
  options: Schema.optional(Schema.Record(Schema.String, FileInputValueSchema)),
}).annotate({
  identifier: "FilesGeneratorSpec",
  title: "Files Generator Spec",
  description: "A supported v1 generated content source and scalar options.",
});

/** @experimental */
export type FileGeneratorSpec = Schema.Schema.Type<typeof FileGeneratorSpecSchema>;

const SourcePathSchema = Schema.Union([
  Schema.NonEmptyString,
  Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
]).annotate({
  identifier: "FilesSourcePath",
  title: "Files Source Path",
  description: "A payload path within src/, or an ordered list of payload paths to concatenate.",
});

const StaticContentSourceSchema = Schema.Struct({
  kind: Schema.Literal("static"),
  path: SourcePathSchema,
}).annotate({
  identifier: "StaticContentSource",
  title: "Static Content Source",
});

const TemplateContentSourceSchema = Schema.Struct({
  kind: Schema.Literal("template"),
  path: SourcePathSchema,
}).annotate({
  identifier: "TemplateContentSource",
  title: "Template Content Source",
});

const GeneratedContentSourceSchema = Schema.Struct({
  kind: Schema.Literal("generated"),
  generator: FileGeneratorSpecSchema,
}).annotate({
  identifier: "GeneratedContentSource",
  title: "Generated Content Source",
});

/**
 * Content source for a files contents entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileContentSourceSchema = Schema.Union([
  StaticContentSourceSchema,
  TemplateContentSourceSchema,
  GeneratedContentSourceSchema,
]).annotate({
  identifier: "FilesContentSource",
  title: "Files Content Source",
  description: "Static, template, or generated source for a materialized file target.",
});

/** @experimental */
export type FileContentSource = Schema.Schema.Type<typeof FileContentSourceSchema>;

/**
 * Materialization modes supported by files packages.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileMaterializationModeSchema = Schema.Literals([
  "sync-once",
  "sync-always",
  "managed-region",
]).annotate({
  identifier: "FilesMaterializationMode",
  title: "Files Materialization Mode",
  description: "How AXM owns or preserves the materialized target.",
});

/** @experimental */
export type FileMaterializationMode = Schema.Schema.Type<typeof FileMaterializationModeSchema>;

const WholeFileContentsEntrySchema = Schema.Struct({
  source: FileContentSourceSchema,
  target: Schema.NonEmptyString,
  mode: Schema.Literals(["sync-once", "sync-always"]),
}).annotate({
  identifier: "WholeFileContentsEntry",
  title: "Whole File Contents Entry",
});

const ManagedRegionContentsEntrySchema = Schema.Struct({
  source: FileContentSourceSchema,
  target: Schema.NonEmptyString,
  mode: Schema.Literal("managed-region"),
  region: Schema.NonEmptyString,
  anchor: Schema.optional(Schema.NonEmptyString),
}).annotate({
  identifier: "ManagedRegionContentsEntry",
  title: "Managed Region Contents Entry",
});

/**
 * One materialization target declared by files.json.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileContentsEntrySchema = Schema.Union([
  WholeFileContentsEntrySchema,
  ManagedRegionContentsEntrySchema,
]).annotate({
  identifier: "FilesContentsEntry",
  title: "Files Contents Entry",
  description: "A files package content source and the workspace target it materializes into.",
});

/** @experimental */
export type FileContentsEntry = Schema.Schema.Type<typeof FileContentsEntrySchema>;

/**
 * Schema for files manifest files (files.json).
 *
 * files packages distribute structural workspace files. They do not declare
 * agent compatibility.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FilesManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("files"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "files package name is required" }),
    Schema.annotate({
      description:
        "Short name for this files package within its owner namespace. Combined with owner, forms the FQN @owner/files/<name>.",
    }),
  ),
  inputs: Schema.optional(FileInputDeclarationsMapSchema),
  contents: Schema.Array(FileContentsEntrySchema)
    .check(Schema.isMinLength(1))
    .pipe(Schema.annotateKey({ messageMissingKey: "files contents are required" })),
}).annotate({
  identifier: "FilesManifest",
  title: "Files Manifest",
  description:
    "files manifest for structural workspace file distribution. Declares payload sources, inputs, and materialization targets.",
});

/**
 * Inferred type for FilesManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type FilesManifest = Schema.Schema.Type<typeof FilesManifestSchema>;
