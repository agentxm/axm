import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "../extensions/common.js";

export const TRUST_STATE_VERSION = 1;
export const TRUST_STATE_FILENAME = "trust.json";

export const TrustAuthoritySchema = Schema.Literals([
  "registry",
  "github",
  "gitlab",
  "bitbucket",
  "azurerepos",
  "git",
  "local",
  "workspace",
  "inline",
]);

export type TrustAuthority = Schema.Schema.Type<typeof TrustAuthoritySchema>;

export const ExtensionTrustRecordSchema = Schema.Struct({
  extensionType: ExtensionTypeSchema,
  name: Schema.String,
  authority: TrustAuthoritySchema,
  sourceIdentity: Schema.String,
  sourceName: Schema.optional(Schema.String),
  resolvedVersion: Schema.optional(Schema.String),
  immutableRevision: Schema.optional(Schema.String),
  publisherBindingId: Schema.optional(Schema.String),
  integrity: Schema.optional(Schema.String),
  contentIdentity: Schema.optional(Schema.String),
}).annotate({
  identifier: "ExtensionTrustRecord",
  title: "Extension Trust Record",
  description:
    "Security-critical source and publisher identity for one known extension identity. Historical timestamps and materialization results are intentionally excluded.",
});

export type ExtensionTrustRecord = Schema.Schema.Type<typeof ExtensionTrustRecordSchema>;

export const WorkspaceTrustStateSchema = Schema.Struct({
  $schema: Schema.optional(Schema.String),
  trustStateVersion: Schema.Literal(TRUST_STATE_VERSION),
  records: Schema.Record(Schema.String, ExtensionTrustRecordSchema),
}).annotate({
  identifier: "WorkspaceTrustState",
  title: "Workspace Trust State",
  description:
    "Authoritative source, resolution, and publisher-epoch baselines used to prevent wrong-origin canonical reuse.",
});

export type WorkspaceTrustState = Schema.Schema.Type<typeof WorkspaceTrustStateSchema>;
