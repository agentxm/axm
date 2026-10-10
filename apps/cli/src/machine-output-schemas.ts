import * as Schema from "effect/Schema";
import { MACHINE_OUTPUT_CONTRACT_ROWS } from "./machine-output-contracts.js";
import {
  DiagnosticReviewDocumentSchema,
  DiagnosticExportDocumentSchema,
} from "./root/diagnostics/command.js";
import { HookTestResultSchema } from "@agentxm/workspace-kernel/operations";
import {
  JsonErrorEnvelopeSchema,
  JsonHelpDocSchema,
  JsonVersionDocSchema,
} from "./cli-runtime/index.js";
import { LoginDocumentSchema } from "@agentxm/registry-access/authentication";
import {
  PublishResultSchema,
  RegistryTransitionSchema,
} from "@agentxm/workspace-features/publishing";
import { VisibilityEvaluationSchema } from "@agentxm/registry-protocol/unstable/publish";
import { ExtensionInventoryDocumentSchema } from "@agentxm/workspace-features/inspection";
import { PlanResolutionDocumentSchema } from "./operation-output.js";
import { AgentCapabilitiesOutputSchema } from "./root/agents/capabilities.js";
import { AgentsListOutputSchema } from "./root/agents/list.js";
import { LoginNoOpDocumentSchema } from "./root/auth/login.js";
import { LogoutDocumentSchema } from "./root/auth/logout.js";
import { RevokeTokenDocumentSchema, TokenListDocumentSchema } from "./root/auth/token.js";
import { WhoamiDocumentSchema } from "./root/auth/whoami.js";
import {
  CachePruneOutputSchema,
  CacheStatusOutputSchema,
  CacheVerifyOutputSchema,
} from "./root/cache/command.js";
import { DiscoverOutputSchema } from "@agentxm/workspace-features/discovery";
import { HelpIndexResultSchema, HelpTopicResultSchema } from "./root/help/command.js";
import {
  KnowledgeConceptGetOutputSchema,
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
  KnowledgeConceptQueryPageSchema,
  KnowledgeConceptRelatedOutputSchema,
  KnowledgeConceptResolveOutputSchema,
  KnowledgeConceptCapabilitiesOutputSchema,
  KnowledgeLintQueryResultSchema,
} from "@agentxm/workspace-features/knowledge-query";
import { LintResultDocumentSchema } from "./root/lint/handler.js";
import { InstructionsStatusOutputSchema } from "./root/instructions.js";
import { SetupDocumentSchema } from "./root/setup.js";
import { ShareWorkspaceDocumentSchema } from "@agentxm/workspace-features/sharing";
import {
  ExtensionListDocumentSchema,
  ExtensionShowResultSchema,
  SubagentRenderResultSchema,
  KnowledgeListQueryResultSchema,
  McpServerListQueryResultSchema,
  PackShowResultSchema,
  ViewDocumentSchema,
  ViewFieldValueSchema,
} from "@agentxm/workspace-features/inspection";
import { UpgradeDocumentSchema } from "./root/upgrade/handler.js";

export const NAMED_MACHINE_OUTPUT_SCHEMAS: Readonly<Record<string, Schema.Top>> = {
  AgentCapabilitiesOutputSchema,
  AgentsListOutputSchema,
  CachePruneOutputSchema,
  CacheStatusOutputSchema,
  CacheVerifyOutputSchema,
  DiscoverOutputSchema,
  DiagnosticReviewDocumentSchema,
  DiagnosticExportDocumentSchema,
  ExtensionInventoryDocumentSchema,
  ExtensionShowResultSchema,
  SubagentRenderResultSchema,
  HelpIndexResultSchema,
  HelpTopicResultSchema,
  HookTestResultSchema,
  InstructionsStatusOutputSchema,
  JsonErrorEnvelopeSchema,
  JsonHelpDocSchema,
  JsonVersionDocSchema,
  KnowledgeLintQueryResultSchema,
  KnowledgeListQueryResultSchema,
  McpServerListQueryResultSchema,
  KnowledgeConceptGetOutputSchema,
  KnowledgeConceptCorpusChangingFailureSchema,
  KnowledgeConceptCursorFailureSchema,
  KnowledgeConceptQueryPageSchema,
  KnowledgeConceptRelatedOutputSchema,
  KnowledgeConceptResolveOutputSchema,
  KnowledgeConceptCapabilitiesOutputSchema,
  LintResultDocumentSchema,
  LoginDocumentSchema,
  LoginNoOpDocumentSchema,
  LogoutDocumentSchema,
  ExtensionListDocumentSchema,
  PackShowResultSchema,
  PlanResolutionDocumentSchema,
  PublishResultSchema,
  RegistryTransitionSchema,
  RevokeTokenDocumentSchema,
  ShareWorkspaceDocumentSchema,
  SetupDocumentSchema,
  TokenListDocumentSchema,
  UpgradeDocumentSchema,
  ViewDocumentSchema,
  ViewFieldValueSchema,
  VisibilityEvaluationSchema,
  WhoamiDocumentSchema,
};

/** One shared Effect compilation allocates references across every result schema. */
export const makeMachineOutputSchema = () => {
  const document = Schema.toJsonSchemaDocument(Schema.Struct(NAMED_MACHINE_OUTPUT_SCHEMAS), {
    onExcessProperty: "error",
  });
  const properties = document.schema["properties"];
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    throw new Error("The named machine-output schemas must compile to object properties");
  }
  const rows = MACHINE_OUTPUT_CONTRACT_ROWS.filter(
    (row) => row.family.outputClass === "structured-result",
  );
  const families = new Map(rows.map((row) => [row.family.id, row.family]));
  const familyDefinitions = Object.fromEntries(
    [...families].map(([id, family]) => {
      if (
        family.schemaNames.length === 0 ||
        family.schemaNames.some((name) => !Object.hasOwn(NAMED_MACHINE_OUTPUT_SCHEMAS, name))
      ) {
        throw new Error(`Missing result schema for ${id}`);
      }
      return [
        `family.${id}`,
        { anyOf: family.schemaNames.map((name) => ({ $ref: `#/$defs/${name}` })) },
      ];
    }),
  );
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://axm.sh/schemas/machine-output.schema.json",
    title: "AXM command result schemas",
    description:
      "Validate a command-specific result using its route reference. Diagnostic-record contents remain unfrozen support artifacts.",
    anyOf: [...families.keys()].map((id) => ({ $ref: `#/$defs/family.${id}` })),
    $defs: { ...document.definitions, ...properties, ...familyDefinitions },
    "x-axm-routes": Object.fromEntries(
      rows.map((row) => [row.path, { $ref: `#/$defs/family.${row.family.id}` }]),
    ),
    "x-axm-error-envelope": { $ref: "#/$defs/JsonErrorEnvelopeSchema" },
    "x-axm-formatter-help": { $ref: "#/$defs/JsonHelpDocSchema" },
    "x-axm-formatter-version": { $ref: "#/$defs/JsonVersionDocSchema" },
  };
};
