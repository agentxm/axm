/** Knowledge uses the common inventory; document inspection is explicit. */
import * as Effect from "effect/Effect";
import { WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";
import type { KnowledgeInstructionEntryResolution } from "@agentxm/workspace-kernel/projection";
import type { ConfiguredAgentOutcome } from "@agentxm/workspace-kernel/operations";
import {
  buildInventoryDocument,
  ExtensionInventoryDocumentSchema,
  type ExtensionListItem,
} from "../inventory-document.js";
import { withInspectionReadView } from "../read-view.js";

export const KnowledgeListQueryResultSchema = ExtensionInventoryDocumentSchema;

export interface KnowledgeListRow {
  readonly management: ExtensionListItem["management"];
  readonly name: string;
  readonly installed: boolean | null;
  readonly configuredAgents: ReadonlyArray<string>;
  readonly observedAgents: ReadonlyArray<string>;
  readonly inspectionState: ExtensionListItem["inspection"]["state"];
  readonly sourceRoot: string;
  readonly concepts?: number;
  readonly diagnostics?: number;
  readonly instructionEntry?: KnowledgeInstructionEntryResolution;
  readonly agentOutcomes: ReadonlyArray<ConfiguredAgentOutcome>;
}

export const ListKnowledge = {
  query: Effect.fn("ListKnowledge.query")(function* (request: {
    readonly agents?: ReadonlyArray<string>;
  }) {
    const records = yield* WorkspaceRecords;
    const base = yield* records.getExtensionInventory("knowledge", {
      agents: request.agents ?? [],
    });
    const document = yield* buildInventoryDocument(base);
    const rows = document.items.map((item): KnowledgeListRow => {
      const inspected =
        item.inspection.state === "complete" || item.inspection.state === "partial"
          ? item.inspection
          : undefined;
      return {
        name: item.name,
        installed: item.installed,
        configuredAgents: item.agents.configured,
        observedAgents: item.agents.observed,
        inspectionState: item.inspection.state,
        management: item.management,
        sourceRoot: item.sourceRoot ?? "n/a",
        ...(inspected?.knowledge === undefined ? {} : inspected.knowledge),
        ...(item.instructionEntry === undefined ? {} : { instructionEntry: item.instructionEntry }),
        agentOutcomes: inspected?.agentOutcomes ?? [],
      };
    });
    return { document, rows } satisfies {
      readonly document: typeof KnowledgeListQueryResultSchema.Type;
      readonly rows: ReadonlyArray<KnowledgeListRow>;
    };
  }, withInspectionReadView),
};
