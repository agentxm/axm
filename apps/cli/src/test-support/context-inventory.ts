/** Context navigation only; canonical requirements retain behavioral authority. */
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as Schema from "effect/Schema";
import {
  EXTENSION_TYPE_TABLE,
  extensionTypes,
} from "@agentxm/extension-model/unstable/extensions/common";
import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";
import { SourceTypeSchema, RefTypeSchema } from "@agentxm/extension-model/unstable/sources/types";
import { WORKSPACE_SCOPES } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  AGENTS,
  CONFIGURABLE_AGENT_IDS,
  HOSTED_AGENTS_BY_ID,
  AvailabilitySchema,
  VendorStatusSchema,
  AxmSupportSchema,
  AgentLifecycleStateSchema,
  AgentInterfaceSchema,
  McpTransportSchema,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { UpgradeAssessmentResultSchema } from "@agentxm/cli-maintenance/self-update/adapters/cli";
import { PublishResultSchema } from "@agentxm/extension-publish";
import { KnowledgeConceptStatusOutputSchema } from "@agentxm/knowledge-query";
import { ExtensionInventorySchema } from "@agentxm/workspace-state";

import { PlanResolutionDocumentSchema } from "../operation-output.js";

const strings = Schema.Array(Schema.String);
const member = Schema.Union([Schema.String, Schema.Boolean, Schema.Null]);
export const ContextInventorySchema = Schema.Struct({
  formatVersion: Schema.Literal(1),
  commandInventory: Schema.Literal("command-behavior-allocation.json"),
  populations: Schema.Record(
    Schema.String,
    Schema.Struct({
      path: Schema.String,
      symbol: Schema.String,
      projection: Schema.optionalKey(Schema.String),
    }),
  ),
  openTopics: Schema.Record(
    Schema.String,
    Schema.Struct({
      nearestRequirement: Schema.optionalKey(Schema.String),
      boundary: Schema.optionalKey(Schema.String),
      question: Schema.String,
    }),
  ),
  bindings: Schema.Record(
    Schema.String,
    Schema.Struct({
      requirements: Schema.optionalKey(strings),
      when: Schema.optionalKey(Schema.String),
      interface: Schema.optionalKey(Schema.String),
      openTopics: Schema.optionalKey(strings),
      exclusion: Schema.optionalKey(Schema.String),
    }),
  ),
  dimensions: Schema.Record(
    Schema.String,
    Schema.Struct({
      family: Schema.String,
      population: Schema.optionalKey(Schema.String),
      populationKind: Schema.optionalKey(Schema.String),
      note: Schema.optionalKey(Schema.String),
      groups: Schema.Array(
        Schema.Struct({
          members: Schema.optionalKey(Schema.Array(member)),
          selector: Schema.optionalKey(Schema.String),
          bindings: strings,
        }),
      ),
    }),
  ),
});
export type ContextInventory = typeof ContextInventorySchema.Type;
export type ContextMember = typeof member.Type;

export const readContextInventory = () => {
  const value: unknown = JSON.parse(
    fs.readFileSync(new URL("./context-allocation.json", import.meta.url), "utf8"),
  );
  return Schema.decodeUnknownEffect(ContextInventorySchema, { onExcessProperty: "error" })(value);
};

const repositoryUrl = new URL("../../../../", import.meta.url);

export const requireContextSourceFile = (relativePath: string): void => {
  if (!/^(?:apps|packages|tools)\//u.test(relativePath) || relativePath.split("/").includes("..")) {
    throw new Error(`Context source must name a repository package file: ${relativePath}`);
  }
  if (!fs.statSync(new URL(relativePath, repositoryUrl)).isFile()) {
    throw new Error(`Context source is not a file: ${relativePath}`);
  }
};

/** One known flat declaration; changed expression shapes require explicit review. */
const machineDocumentKinds = (): ReadonlyArray<string> => {
  const relativePath = "apps/cli/src/cli-runtime/machine-output-document.ts";
  const filename = fileURLToPath(new URL(relativePath, repositoryUrl));
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, "utf8"),
    ts.ScriptTarget.Latest,
    false,
  );
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "MachineOutputDocumentKindSchema"
      )
        continue;
      const call = declaration.initializer;
      if (
        call === undefined ||
        !ts.isCallExpression(call) ||
        !ts.isPropertyAccessExpression(call.expression) ||
        !ts.isIdentifier(call.expression.expression) ||
        call.expression.expression.text !== "Schema" ||
        call.expression.name.text !== "Literals" ||
        call.arguments.length !== 1
      )
        throw new Error(
          "MachineOutputDocumentKindSchema must remain a named flat literal declaration",
        );
      const argument = call.arguments[0];
      if (
        argument !== undefined &&
        ts.isAsExpression(argument) &&
        (!ts.isTypeReferenceNode(argument.type) ||
          !ts.isIdentifier(argument.type.typeName) ||
          argument.type.typeName.text !== "const" ||
          argument.type.typeArguments !== undefined)
      )
        throw new Error("Machine document kind arrays permit only an as-const annotation");
      const array =
        argument !== undefined && ts.isAsExpression(argument) ? argument.expression : argument;
      if (array === undefined || !ts.isArrayLiteralExpression(array)) {
        throw new Error("Machine document kinds must be a literal array");
      }
      return array.elements.map((element) => {
        if (!ts.isStringLiteral(element)) {
          throw new Error("Machine document kinds contain a nonliteral member");
        }
        return element.text;
      });
    }
  }
  throw new Error("MachineOutputDocumentKindSchema was not found");
};

/** Public field access is explicit; there is no generic schema traversal. */
export const observeContextPopulations = () => {
  const inventoryRow = ExtensionInventorySchema.fields.items.value.fields;
  const plan = PlanResolutionDocumentSchema.fields.result.fields;
  const unit = plan.units.value.fields;
  const block = plan.blocking.schema.members[0].fields;
  const publicationItem = PublishResultSchema.fields.execution.fields.outcomes.value.fields;
  const upgrade = UpgradeAssessmentResultSchema.fields;
  const knowledge = KnowledgeConceptStatusOutputSchema.fields;
  // These two domains have primitive schemas, not Schema.Literals declarations.
  // The exact primitive shape supplies the finite Boolean/null population.
  if (
    inventoryRow.installed.ast._tag !== "Boolean" ||
    inventoryRow.enabled.members[0].ast._tag !== "Boolean" ||
    inventoryRow.enabled.members[1].ast._tag !== "Null"
  )
    throw new Error(
      "Inventory activation/materialization domains changed; review context allocation",
    );

  return {
    "extension-types": extensionTypes,
    "extension-placement": [
      ...new Set(Object.values(EXTENSION_TYPE_TABLE).map((row) => row.placement)),
    ],
    "extension-inputs": Object.entries(EXTENSION_TYPE_TABLE)
      .filter(([, row]) => row.installInputs)
      .map(([type]) => type),
    "catalog-types": CATALOG_EXTENSION_TYPES,
    "source-kinds": SourceTypeSchema.literals,
    "reference-kinds": RefTypeSchema.literals,
    "workspace-scopes": WORKSPACE_SCOPES,
    "native-availability": AvailabilitySchema.members.map((schema) => schema.fields.via.literal),
    "vendor-surface-state": VendorStatusSchema.members.map((schema) => schema.fields.state.literal),
    "axm-support": AxmSupportSchema.literals,
    "agent-lifecycle": AgentLifecycleStateSchema.literals,
    "agent-interface": AgentInterfaceSchema.literals,
    "agent-mcp-transport": McpTransportSchema.literals,
    "inventory-lifecycle": inventoryRow.classification.fields.lifecycle.literals,
    "inventory-activation": [true, false, null],
    "inventory-materialization": [true, false],
    "configured-agent-outcome": unit.agentOutcomes.schema.members[0].value.fields.outcome.literals,
    "unit-state": unit.state.literals,
    "operation-outcome": plan.outcome.literals,
    "unit-disposition": unit.disposition.schema.members[0].literals,
    "operation-phase": block.phase.literals,
    "atomicity-class": plan.atomicity.fields.declared.literals,
    "blocking-class": block.class.literals,
    "operation-error": plan.failure.schema.members[0].fields.code.literals,
    "machine-document": machineDocumentKinds(),
    "publish-status": publicationItem.status.literals,
    "publish-action": publicationItem.action.literals,
    "publish-reason": publicationItem.reason.literals,
    "upgrade-outcome": upgrade.outcome.literals,
    "upgrade-disposition": upgrade.disposition.literals,
    "upgrade-availability": upgrade.installerAvailability.fields.state.literals,
    "knowledge-readiness": knowledge.readiness.literals,
    "knowledge-health": knowledge.health.fields.status.literals,
    "knowledge-collisions": knowledge.scopeCollisions.fields.state.literals,
  } satisfies Readonly<Record<string, ReadonlyArray<ContextMember>>>;
};

/** Catalog membership only; no vendor-conformance or selection-policy claim. */
export const observeAgentPartitions = () => ({
  catalog: AGENTS.map((agent) => agent.id),
  configurable: [...CONFIGURABLE_AGENT_IDS],
  hosted: Object.keys(HOSTED_AGENTS_BY_ID),
});
