/** Manifest schema for Open Knowledge Format bundles. */

import * as Schema from "effect/Schema";
import {
  CommonManifestBaseFields,
  ExtensionNameSchema,
  NonPackManifestFields,
} from "../extensions/common.js";

export const KNOWLEDGE_MANIFEST_FILENAME = "knowledge.json";
export const KNOWLEDGE_EXTENSION_DIR = "knowledge";
export const KNOWLEDGE_SOURCE_DIR = "src";
export const KNOWLEDGE_MANIFEST_SCHEMA_URL = "https://axm.sh/schemas/knowledge.schema.json";

export const KnowledgeManifestSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  ...CommonManifestBaseFields,
  ...NonPackManifestFields,
  type: Schema.Literal("knowledge"),
  format: Schema.Struct({
    name: Schema.Literal("okf"),
    version: Schema.Literal("0.2"),
  }).annotate({
    description: "Open Knowledge Format dialect and version used by this bundle.",
  }),
  bundleRoot: Schema.Literal(KNOWLEDGE_SOURCE_DIR).annotate({
    description: "Package-relative directory containing the authoritative OKF bundle.",
  }),
  name: ExtensionNameSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "knowledge bundle name is required" }),
    Schema.annotate({
      description: "Short bundle name. Combined with owner, forms the FQN @owner/knowledge/<name>.",
    }),
  ),
}).annotate({
  identifier: "KnowledgeManifest",
  title: "Knowledge Manifest",
  description: "Manifest for an isolated Open Knowledge Format bundle rooted at src/.",
});

export type KnowledgeManifest = Schema.Schema.Type<typeof KnowledgeManifestSchema>;
