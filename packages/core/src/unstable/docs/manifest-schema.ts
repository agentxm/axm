/**
 * docs manifest schema definition.
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
 * Filename for docs manifests.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DOCS_MANIFEST_FILENAME = "docs.json";

/**
 * Local directory segment for docs packages under `.axm/extensions`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DOCS_EXTENSION_DIR = "docs";

/**
 * URL for the docs manifest JSON Schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DOCS_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/docs.schema.json";

/**
 * Scalar values accepted by docs inputs and template substitution.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileInputValueSchema = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
]).annotate({
  identifier: "DocsInputValue",
  title: "Docs Input Value",
  description: "Scalar value used to render docs templates.",
});

/** @experimental */
export type FileInputValue = Schema.Schema.Type<typeof FileInputValueSchema>;

const FileInputStringDeclarationSchema = Schema.Struct({
  type: Schema.Literal("string"),
  prompt: Schema.optional(Schema.String),
  default: Schema.optional(Schema.String),
}).annotate({
  identifier: "DocsInputStringDeclaration",
  title: "Docs Input String Declaration",
});

const FileInputNumberDeclarationSchema = Schema.Struct({
  type: Schema.Literal("number"),
  prompt: Schema.optional(Schema.String),
  default: Schema.optional(Schema.Number),
}).annotate({
  identifier: "DocsInputNumberDeclaration",
  title: "Docs Input Number Declaration",
});

const FileInputBooleanDeclarationSchema = Schema.Struct({
  type: Schema.Literal("boolean"),
  prompt: Schema.optional(Schema.String),
  default: Schema.optional(Schema.Boolean),
}).annotate({
  identifier: "DocsInputBooleanDeclaration",
  title: "Docs Input Boolean Declaration",
});

const FileInputEnumDeclarationSchema = Schema.Struct({
  type: Schema.Literal("enum"),
  prompt: Schema.optional(Schema.String),
  values: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  default: Schema.optional(Schema.String),
}).annotate({
  identifier: "DocsInputEnumDeclaration",
  title: "Docs Input Enum Declaration",
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
  identifier: "DocsInputDeclaration",
  title: "Docs Input Declaration",
  description: "A scalar input declaration for a docs template.",
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
  identifier: "DocsInputDeclarationsMap",
  title: "Docs Input Declarations Map",
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
  identifier: "DocsGeneratorSpec",
  title: "Docs Generator Spec",
  description: "A supported v1 generated content source and scalar options.",
});

/** @experimental */
export type FileGeneratorSpec = Schema.Schema.Type<typeof FileGeneratorSpecSchema>;

const SourcePathSchema = Schema.Union([
  Schema.NonEmptyString,
  Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
]).annotate({
  identifier: "DocsSourcePath",
  title: "Docs Source Path",
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
 * Content source for a docs contents entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileContentSourceSchema = Schema.Union([
  StaticContentSourceSchema,
  TemplateContentSourceSchema,
  GeneratedContentSourceSchema,
]).annotate({
  identifier: "DocsContentSource",
  title: "Docs Content Source",
  description: "Static, template, or generated source for a materialized file target.",
});

/** @experimental */
export type FileContentSource = Schema.Schema.Type<typeof FileContentSourceSchema>;

/**
 * Materialization modes supported by docs packages.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileMaterializationModeSchema = Schema.Literals([
  "sync-once",
  "sync-always",
  "managed-region",
]).annotate({
  identifier: "DocsMaterializationMode",
  title: "Docs Materialization Mode",
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
 * One materialization target declared by docs.json.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const FileContentsEntrySchema = Schema.Union([
  WholeFileContentsEntrySchema,
  ManagedRegionContentsEntrySchema,
]).annotate({
  identifier: "DocsContentsEntry",
  title: "Docs Contents Entry",
  description: "A docs package content source and the workspace target it materializes into.",
});

/** @experimental */
export type FileContentsEntry = Schema.Schema.Type<typeof FileContentsEntrySchema>;

/**
 * Schema for docs manifest files (docs.json).
 *
 * docs packages distribute structural workspace files. They do not declare
 * agent compatibility.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const DocsManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("docs"),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "docs package name is required" }),
    Schema.annotate({
      description:
        "Short name for this docs package within its owner namespace. Combined with owner, forms the FQN @owner/docs/<name>.",
    }),
  ),
  inputs: Schema.optional(FileInputDeclarationsMapSchema),
  contents: Schema.Array(FileContentsEntrySchema)
    .check(Schema.isMinLength(1))
    .pipe(Schema.annotateKey({ messageMissingKey: "docs contents are required" })),
}).annotate({
  identifier: "DocsManifest",
  title: "Docs Manifest",
  description:
    "docs manifest for structural workspace file distribution. Declares payload sources, inputs, and materialization targets.",
});

/**
 * Inferred type for DocsManifest schema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DocsManifest = Schema.Schema.Type<typeof DocsManifestSchema>;
