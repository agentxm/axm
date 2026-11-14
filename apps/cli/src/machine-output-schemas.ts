import { rootCommand } from "./app.js";
import { registeredCommandCapabilities } from "./root/shared/command-capabilities.js";
import { commandOutputModes, outputContractSummary } from "./output-discovery.js";
import * as Schema from "effect/Schema";
import * as Predicate from "effect/Predicate";
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
import { JsonEnvelopeSchema } from "./cli-runtime/json-envelope.js";
import {
  LoginDocumentSchema,
  DeviceLoginPendingDocumentSchema,
} from "@agentxm/registry-access/authentication";
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
import { HelpIndexResultSchema, HelpTopicResultSchema } from "./root/help/contracts.js";
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
  LocalInspectionDocumentSchema,
  LocalCheckDocumentSchema,
  SubagentRenderResultSchema,
  KnowledgeListQueryResultSchema,
  McpServerListQueryResultSchema,
  ViewDocumentSchema,
  ViewFieldValueSchema,
} from "@agentxm/workspace-features/inspection";
import { UpgradeDocumentSchema } from "./root/upgrade/handler.js";

import { JsonSchemaDocumentSchema } from "./root/schema/contracts.js";
import {
  schemaNode,
  schemaObject,
  schemaAlternatives,
  type SchemaNode,
  standaloneSchema,
} from "./root/schema/json-schema.js";

export const NAMED_MACHINE_OUTPUT_SCHEMAS: Readonly<Record<string, Schema.Top>> = {
  AgentCapabilitiesOutputSchema,
  JsonSchemaDocumentSchema,
  AgentsListOutputSchema,
  CachePruneOutputSchema,
  CacheStatusOutputSchema,
  CacheVerifyOutputSchema,
  DiscoverOutputSchema,
  DiagnosticReviewDocumentSchema,
  DiagnosticExportDocumentSchema,
  ExtensionInventoryDocumentSchema,
  LocalInspectionDocumentSchema,
  LocalCheckDocumentSchema,
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
  DeviceLoginPendingDocumentSchema,
  LoginNoOpDocumentSchema,
  LogoutDocumentSchema,
  ExtensionListDocumentSchema,
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

/** One compilation owns renderer payloads and their actual stdout projections. */
export const makeMachineOutputSchema = () => {
  const document = Schema.toJsonSchemaDocument(
    Schema.Struct({ ...NAMED_MACHINE_OUTPUT_SCHEMAS, JsonEnvelopeSchema }),
    { onExcessProperty: "error" },
  );
  const properties = schemaObject(document.schema["properties"]);
  const capabilities = new Map(
    registeredCommandCapabilities(rootCommand).map((entry) => [
      ["axm", ...entry.path].join(" "),
      entry.capabilities,
    ]),
  );
  for (const row of MACHINE_OUTPUT_CONTRACT_ROWS) {
    const declared = capabilities.get(row.path);
    if (declared === undefined) throw new Error(`Missing command capabilities for ${row.path}`);
    if (
      row.family.outputClass === "structured-result" &&
      JSON.stringify([...row.family.modes].sort()) !==
        JSON.stringify([...commandOutputModes(declared)].sort())
    ) {
      throw new Error(`Output modes disagree with command capabilities for ${row.path}`);
    }
  }
  const definitions: Record<string, unknown> = { ...document.definitions, ...properties };
  const source = { $defs: definitions };
  const families = new Map(MACHINE_OUTPUT_CONTRACT_ROWS.map((row) => [row.family.id, row.family]));
  const error = { $ref: "#/$defs/JsonErrorEnvelopeSchema" };
  const help = { $ref: "#/$defs/JsonHelpDocSchema" };
  const version = { $ref: "#/$defs/JsonVersionDocSchema" };
  const normalizePayload = (node: SchemaNode, promoted: ReadonlyArray<string>): SchemaNode => {
    const unwrapped = schemaAlternatives(node, source).flatMap((variant) => {
      if (typeof variant === "boolean" || !Predicate.isObject(variant["properties"]))
        return [variant];
      const fields = schemaObject(variant["properties"]);
      const keys = Object.keys(fields);
      return keys.length === 1 && keys[0] === "result"
        ? schemaAlternatives(schemaNode(fields["result"]), source)
        : [variant];
    });
    const variants = unwrapped.map((variant): SchemaNode => {
      if (typeof variant === "boolean") return variant;
      const fields = variant["properties"];
      if (!Predicate.isObject(fields)) return variant;
      return {
        ...variant,
        properties: Object.fromEntries(
          Object.entries(fields).filter(([key]) => !promoted.includes(key)),
        ),
        ...(Array.isArray(variant["required"])
          ? {
              required: variant["required"].filter(
                (key) => typeof key === "string" && !promoted.includes(key),
              ),
            }
          : {}),
      };
    });
    return variants.length === 1 ? (variants[0] ?? false) : { anyOf: variants };
  };
  const envelopeAlternatives = schemaAlternatives({ $ref: "#/$defs/JsonEnvelopeSchema" }, source);
  for (const [id, family] of families) {
    for (const name of family.schemaNames) {
      if (!Object.hasOwn(NAMED_MACHINE_OUTPUT_SCHEMAS, name))
        throw new Error(`Missing result schema for ${id}: ${name}`);
    }
    if (family.outputClass === "structured-result") {
      definitions[`payload.${id}`] = {
        anyOf: family.schemaNames.map((name) =>
          normalizePayload({ $ref: `#/$defs/${name}` }, family.promotedResultFields),
        ),
      };
      const payload = { $ref: `#/$defs/payload.${id}` };
      definitions[`family.${id}`] = {
        anyOf: [
          ...envelopeAlternatives.flatMap((variant) => {
            if (typeof variant === "boolean" || !Predicate.isObject(variant["properties"]))
              return [];
            const fields = schemaObject(variant["properties"]);
            if (!Object.hasOwn(fields, "result")) return [];
            return [
              {
                ...variant,
                properties: { ...fields, result: payload, mode: { enum: family.modes } },
              },
            ];
          }),
          error,
          help,
          version,
        ],
      };
    } else if (family.outputClass === "formatter-help") {
      definitions[`family.${id}`] = { anyOf: [help, version, error] };
    } else if (family.outputClass === "json-schema-document") {
      definitions[`family.${id}`] = {
        anyOf: [{ $ref: "#/$defs/JsonSchemaDocumentSchema" }, error, help, version],
      };
    }
  }
  const rows = MACHINE_OUTPUT_CONTRACT_ROWS.filter((row) =>
    Object.hasOwn(definitions, `family.${row.family.id}`),
  );
  const result = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://axm.sh/schemas/machine-output.schema.json",
    title: "AXM command stdout schemas",
    description:
      "Validate the complete stdout document using its route reference. Diagnostic-record contents remain unfrozen support artifacts.",
    anyOf: [...new Set(rows.map((row) => row.family.id))].map((id) => ({
      $ref: `#/$defs/family.${id}`,
    })),
    $defs: definitions,
    "x-axm-command-contracts": Object.fromEntries(
      MACHINE_OUTPUT_CONTRACT_ROWS.map((row) => [
        row.path,
        outputContractSummary(row.path, capabilities.get(row.path)),
      ]),
    ),
    "x-axm-routes": Object.fromEntries(
      rows.map((row) => [row.path, { $ref: `#/$defs/family.${row.family.id}` }]),
    ),
    "x-axm-error-envelope": error,
    "x-axm-formatter-help": help,
    "x-axm-formatter-version": version,
  };
  // Fail generation for dangling or remote references, including in definitions
  // not selected by a particular command's export.
  for (const name of Object.keys(definitions))
    standaloneSchema(result, { $ref: `#/$defs/${name}` });
  return result;
};
