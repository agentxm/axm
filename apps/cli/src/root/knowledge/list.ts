import * as Effect from "effect/Effect";
import {
  KnowledgeListQueryResultSchema,
  ListKnowledge,
  type KnowledgeListRow,
} from "@agentxm/workspace-features/inspection";
import type { KnowledgeInstructionEntryResolution } from "@agentxm/workspace-kernel/projection";

import { inspectionFailureToAppError } from "../../feature-errors.js";
import { ABSENT, count, type ViewColumn } from "../../screen/index.js";
import { inventoryAgentOutcomes, inventoryLifecycle } from "../inventory-view.js";
import { makePerTypeListCommand } from "../shared/list-command.js";

const renderInstructionEntry = (
  resolution: KnowledgeInstructionEntryResolution | undefined,
): string =>
  resolution === undefined
    ? ABSENT
    : `${resolution.included ? "included" : "excluded"} (${resolution.reason})`;

const BundleColumns = [
  { header: "Bundle", priority: "required", value: (row: KnowledgeListRow) => row.name },
  {
    header: "Management",
    value: (row: KnowledgeListRow) => inventoryLifecycle({ lifecycle: row.management }),
  },
  { header: "Concepts", align: "right", value: (row: KnowledgeListRow) => String(row.concepts) },
  {
    header: "Diagnostics",
    align: "right",
    value: (row: KnowledgeListRow) => String(row.diagnostics),
  },
  { header: "Source", priority: "optional", value: (row: KnowledgeListRow) => row.sourceRoot },
  {
    header: "Instruction entry",
    priority: "optional",
    value: (row: KnowledgeListRow) => renderInstructionEntry(row.instructionEntry),
  },
  {
    header: "Agent outcomes",
    priority: "optional",
    value: (row: KnowledgeListRow) => inventoryAgentOutcomes(row.agentOutcomes),
  },
] satisfies ReadonlyArray<ViewColumn<KnowledgeListRow>>;

const { handler, command } = makePerTypeListCommand({
  type: "knowledge",
  query: (agents) =>
    ListKnowledge.query({ agents }).pipe(Effect.mapError(inspectionFailureToAppError)),
  schema: KnowledgeListQueryResultSchema,
  columns: BundleColumns,
  summary: (_document, rows) => count(rows.length, "knowledge bundle"),
});

export const handleList = handler;
export const listCommand = command;
