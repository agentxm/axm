import * as Schema from "effect/Schema";
import { KNOWLEDGE_SEARCH_TOKENIZER_PROFILE } from "@agentxm/registry-protocol/unstable/knowledge/knowledge-search";
import {
  KNOWLEDGE_DISCOVERY_OPERATIONS,
  KNOWLEDGE_LIFECYCLE_FILTER_FIELDS,
  KNOWLEDGE_METADATA_FILTER_FIELDS,
  KNOWLEDGE_QUERY_CONTRACT_VERSION,
  KNOWLEDGE_QUERY_OPERATORS,
  KNOWLEDGE_SEARCHABLE_FIELDS,
} from "./knowledge-query.js";

export const KNOWLEDGE_DISCOVERY_CAPABILITIES_VERSION = "axm-knowledge-discovery-capabilities-v1";

export const KnowledgeDiscoveryCapabilitiesSchema = Schema.Struct({
  version: Schema.Literal(KNOWLEDGE_DISCOVERY_CAPABILITIES_VERSION),
  operations: Schema.Array(Schema.Literals(KNOWLEDGE_DISCOVERY_OPERATIONS)),
  queryContractVersion: Schema.Literal(KNOWLEDGE_QUERY_CONTRACT_VERSION),
  strategies: Schema.Array(Schema.Literal("lexical")),
  operators: Schema.Array(Schema.Literals(KNOWLEDGE_QUERY_OPERATORS)),
  tokenizerProfile: Schema.Struct({
    id: Schema.Literal(KNOWLEDGE_SEARCH_TOKENIZER_PROFILE.id),
    unicodeNormalization: Schema.Literal(KNOWLEDGE_SEARCH_TOKENIZER_PROFILE.unicodeNormalization),
    caseNormalization: Schema.Literal(KNOWLEDGE_SEARCH_TOKENIZER_PROFILE.caseNormalization),
    termBoundary: Schema.Literal(KNOWLEDGE_SEARCH_TOKENIZER_PROFILE.termBoundary),
    stemming: Schema.Literal(KNOWLEDGE_SEARCH_TOKENIZER_PROFILE.stemming),
  }),
  searchableFields: Schema.Array(Schema.Literals(KNOWLEDGE_SEARCHABLE_FIELDS)),
  metadataFilterFields: Schema.Array(Schema.Literals(KNOWLEDGE_METADATA_FILTER_FIELDS)),
  lifecycleFilterFields: Schema.Array(Schema.Literals(KNOWLEDGE_LIFECYCLE_FILTER_FIELDS)),
  extensionProperties: Schema.Struct({
    addressing: Schema.Literal("rfc6901-json-pointer"),
    source: Schema.Literal("preserved-frontmatter"),
  }),
  limits: Schema.Struct({
    defaultPageSize: Schema.Number,
    maximumPageSize: Schema.Number,
    defaultPassagesPerResult: Schema.Number,
    maximumPassagesPerResult: Schema.Number,
    defaultPassageLength: Schema.Number,
    maximumPassageLength: Schema.Number,
    maximumTraversalDepth: Schema.Number,
    maximumFuzzyCandidates: Schema.Number,
  }),
  cursor: Schema.Struct({
    mechanism: Schema.Literal("stateless-opaque"),
    maximumAgeSeconds: Schema.Number,
    binds: Schema.Array(
      Schema.Literals(["corpus-fingerprint", "canonical-query-digest", "ordering-position"]),
    ),
  }),
  output: Schema.Struct({
    envelope: Schema.Literal("axm.machine-output/result-envelope-v1"),
    resultLevel: Schema.Literal("concept"),
    paginationKeys: Schema.Array(Schema.Literals(["items", "count", "hasMore", "cursor"])),
  }),
}).annotate({
  identifier: "KnowledgeDiscoveryCapabilities",
  title: "Knowledge Discovery Capabilities",
});

export type KnowledgeDiscoveryCapabilities = typeof KnowledgeDiscoveryCapabilitiesSchema.Type;

export const KNOWLEDGE_DISCOVERY_CAPABILITIES: KnowledgeDiscoveryCapabilities = {
  version: KNOWLEDGE_DISCOVERY_CAPABILITIES_VERSION,
  operations: KNOWLEDGE_DISCOVERY_OPERATIONS,
  queryContractVersion: KNOWLEDGE_QUERY_CONTRACT_VERSION,
  strategies: ["lexical"],
  operators: KNOWLEDGE_QUERY_OPERATORS,
  tokenizerProfile: KNOWLEDGE_SEARCH_TOKENIZER_PROFILE,
  searchableFields: KNOWLEDGE_SEARCHABLE_FIELDS,
  metadataFilterFields: KNOWLEDGE_METADATA_FILTER_FIELDS,
  lifecycleFilterFields: KNOWLEDGE_LIFECYCLE_FILTER_FIELDS,
  extensionProperties: {
    addressing: "rfc6901-json-pointer",
    source: "preserved-frontmatter",
  },
  limits: {
    defaultPageSize: 25,
    maximumPageSize: 100,
    defaultPassagesPerResult: 3,
    maximumPassagesPerResult: 10,
    defaultPassageLength: 500,
    maximumPassageLength: 2_000,
    maximumTraversalDepth: 3,
    maximumFuzzyCandidates: 10,
  },
  cursor: {
    mechanism: "stateless-opaque",
    maximumAgeSeconds: 86_400,
    binds: ["corpus-fingerprint", "canonical-query-digest", "ordering-position"],
  },
  output: {
    envelope: "axm.machine-output/result-envelope-v1",
    resultLevel: "concept",
    paginationKeys: ["items", "count", "hasMore", "cursor"],
  },
};
