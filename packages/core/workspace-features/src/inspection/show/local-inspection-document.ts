import * as Schema from "effect/Schema";
import { InstallableExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  NativeLocationRecordSchema,
  NativeReaderDeclarationSchema,
} from "@agentxm/workspace-kernel/locations";
import { ShowAgentOutcomeSchema } from "./agent-outcomes.js";
import { McpFactsSchema } from "./mcp-facts.js";
import { PackMemberEvidenceSchema } from "../packs/pack-members.js";

const CoverageSchema = Schema.Struct({
  state: Schema.Literals(["complete", "partial", "unknown", "not-applicable"]),
  reasons: Schema.Array(Schema.String),
});
const SourceSchema = Schema.Struct({
  authority: Schema.Literals([
    "workspace",
    "registry",
    "git",
    "http",
    "path",
    "bundled",
    "inline",
    "unmanaged",
    "unknown",
  ]),
  locator: Schema.optionalKey(Schema.String),
  sourceName: Schema.optionalKey(Schema.String),
  endpoint: Schema.optionalKey(Schema.String),
});
const InspectionIdentitySchema = Schema.Struct({
  type: Schema.optionalKey(InstallableExtensionTypeSchema),
  name: Schema.String,
  fqn: Schema.optionalKey(Schema.String),
  scope: Schema.Literals(["project", "user"]),
  source: SourceSchema,
});
export type InspectionIdentity = typeof InspectionIdentitySchema.Type;
const AddressSchema = Schema.Struct({
  path: Schema.String,
  keys: Schema.optionalKey(Schema.Array(Schema.String)),
});
const {
  extensionType: _extensionType,
  name: _name,
  ...contextualAgentFields
} = ShowAgentOutcomeSchema.fields;
const InspectionAgentOutcomeSchema = Schema.Struct(contextualAgentFields).annotate({
  description:
    "Per-agent evidence for the enclosing subject identity; its extension type and name are supplied once by identity.",
});
const InspectionItemSchema = Schema.Struct({
  id: Schema.String,
  identity: InspectionIdentitySchema,
  requestRefs: Schema.Array(Schema.String),
  editing: Schema.Struct({
    kind: Schema.Literals([
      "authored-source",
      "inline-configuration",
      "authoring-transition-required",
      "bundled",
      "unmanaged",
      "unavailable",
      "unknown",
    ]),
    address: Schema.optionalKey(AddressSchema),
    reason: Schema.String,
  }),
  desired: Schema.Struct({
    state: Schema.Literals(["reached", "not-reached", "unknown"]),
    direct: Schema.Boolean,
    enabled: Schema.NullOr(Schema.Boolean),
    packOrigins: Schema.Array(Schema.String),
    declarations: Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(["direct", "pack"]),
        address: AddressSchema,
        contributorRef: Schema.optionalKey(Schema.String),
        source: Schema.optionalKey(Schema.String),
        constraint: Schema.optionalKey(Schema.String),
        enabled: Schema.Boolean,
      }),
    ),
    preference: Schema.optionalKey(
      Schema.Struct({ address: AddressSchema, enabled: Schema.optionalKey(Schema.Boolean) }),
    ),
    coverage: CoverageSchema,
  }),
  accepted: Schema.Struct({
    state: Schema.Literals(["present", "absent", "not-applicable", "unknown"]),
    version: Schema.optionalKey(Schema.String),
    source: Schema.optionalKey(SourceSchema),
    coverage: CoverageSchema,
  }),
  observed: Schema.Struct({
    state: Schema.Literals(["present", "absent", "unreadable", "unverified", "not-applicable"]),
    path: Schema.optionalKey(Schema.String),
    manifestVersion: Schema.optionalKey(Schema.String),
    canonicalStatus: Schema.optionalKey(Schema.String),
    drift: Schema.Literals(["detected", "not-detected", "not-checked", "not-applicable"]),
    coverage: CoverageSchema,
  }),
  retention: Schema.Struct({
    reasons: Schema.Array(
      Schema.Struct({
        kind: Schema.Literals([
          "direct-declaration",
          "pack-route",
          "shared-package-consumer",
          "authored-content",
          "native-reference",
          "possible-native-reference",
          "insufficient-evidence",
        ]),
        contributorRef: Schema.optionalKey(Schema.String),
        locationRef: Schema.optionalKey(Schema.String),
        detail: Schema.String,
      }),
    ),
    coverage: CoverageSchema,
  }),
  nativeLocationRefs: Schema.Array(Schema.String),
  duplicateDiscoveries: Schema.Array(
    Schema.Struct({ agentId: Schema.String, nativeLocationRefs: Schema.Array(Schema.String) }),
  ),
  nativeCoverage: CoverageSchema,
  agents: Schema.Struct({
    configured: Schema.Array(Schema.String),
    observed: Schema.Array(Schema.String),
  }),
  agentOutcomes: Schema.Array(InspectionAgentOutcomeSchema),
  knowledge: Schema.optionalKey(
    Schema.Struct({ concepts: Schema.Number, diagnostics: Schema.Number }),
  ),
  mcp: Schema.optionalKey(McpFactsSchema),
  pack: Schema.optionalKey(
    Schema.Struct({
      membership: Schema.Literals(["known", "unknown"]),
      routes: Schema.Literals(["active", "dormant", "unauthorized", "unknown"]),
      members: Schema.Array(
        Schema.Struct({ ...PackMemberEvidenceSchema.fields, subjectRef: Schema.String }),
      ),
      reason: Schema.optionalKey(Schema.String),
    }),
  ),
  runtime: Schema.Struct({ state: Schema.Literal("not-checked") }),
});
export type InspectionItem = typeof InspectionItemSchema.Type;
const InspectionRequestResultSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["identity", "path", "all"]),
  input: Schema.String,
  resolution: Schema.Literals(["resolved", "not-found", "conflict"]),
  code: Schema.Literals([0, 3, 6]),
  subjectRefs: Schema.Array(Schema.String),
  candidateRefs: Schema.Array(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  navigation: Schema.optionalKey(Schema.Array(Schema.String)),
  path: Schema.optionalKey(
    Schema.Struct({
      lexical: Schema.String,
      entry: Schema.String,
      referent: Schema.optionalKey(Schema.String),
      unownedRemainder: Schema.Boolean,
    }),
  ),
});
export type InspectionRequestResult = typeof InspectionRequestResultSchema.Type;
export const LocalInspectionDocumentSchema = Schema.Struct({
  scope: Schema.Literals(["project", "user"]),
  requests: Schema.Array(InspectionRequestResultSchema),
  items: Schema.Array(InspectionItemSchema),
  supportingSubjects: Schema.Array(
    Schema.Struct({ id: Schema.String, identity: InspectionIdentitySchema }),
  ),
  nativeLocations: Schema.Array(NativeLocationRecordSchema),
  nativeReaderDeclarations: Schema.Array(NativeReaderDeclarationSchema),
  observationDiagnostics: Schema.Array(
    Schema.Struct({
      message: Schema.String,
      path: Schema.optionalKey(Schema.String),
      code: Schema.optionalKey(Schema.String),
      source: Schema.optionalKey(Schema.String),
    }),
  ),
  coverage: CoverageSchema,
});
export type LocalInspectionDocument = typeof LocalInspectionDocumentSchema.Type;
