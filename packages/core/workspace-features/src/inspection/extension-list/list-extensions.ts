import { withInspectionReadView } from "../read-view.js";
/**
 * The cross-type extension inventory behind `axm list`.
 *
 * One request names the filter — the whole inventory, only what has an update,
 * or only what its registry deprecated — and the answer is a typed document:
 * the matching items, how many of the installed extensions could actually be
 * assessed, and, for a lifecycle view, the deprecation detail that explains
 * each row.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";
import {
  buildInventoryDocument,
  ExtensionListItemSchema,
  ExtensionInventoryDocumentFields,
  inventoryEnvelope,
} from "../inventory-document.js";
import { WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import {
  assessExtensionListItems,
  collectExtensionListItems,
  type ExtensionListFilter,
  type AssessedExtensionListItem,
} from "./assessment.js";

const AssessmentStateSchema = Schema.Literals([
  "not-checked",
  "current",
  "available",
  "changed",
  "active",
  "deprecated",
  "unknown",
  "not-applicable",
] as const);

const ExtensionAssessmentSchema = Schema.Struct({
  state: AssessmentStateSchema,
  reason: Schema.optional(Schema.String),
  installedVersion: Schema.optional(Schema.String),
  constraint: Schema.optional(Schema.String),
  latestMatching: Schema.optional(Schema.String),
  latestAvailable: Schema.optional(Schema.String),
  installedRevision: Schema.optional(Schema.String),
  currentRevision: Schema.optional(Schema.String),
  deprecation: Schema.optional(DeprecationViewSchema),
});

const AssessedExtensionListItemSchema = Schema.Struct({
  ...ExtensionListItemSchema.fields,
  assessment: ExtensionAssessmentSchema,
});

/** How much of the installed inventory the assessment could actually reach. */
const CoverageSchema = Schema.Struct({
  eligible: Schema.Number,
  checked: Schema.Number,
  unknown: Schema.Number,
  notApplicable: Schema.Number,
});

export const ExtensionListDocumentSchema = Schema.Struct({
  ...ExtensionInventoryDocumentFields,
  items: Schema.Array(AssessedExtensionListItemSchema),
  coverage: Schema.optional(CoverageSchema),
});
export type ExtensionListDocument = typeof ExtensionListDocumentSchema.Type;

export interface ListExtensionsRequest {
  /** Restrict the inventory to these extension types, combined as a union. */
  readonly types?: ReadonlyArray<InstallableExtensionType>;
  /** Which extensions the answer keeps. Exactly one filter is in force. */
  readonly filter: ExtensionListFilter;
}

/**
 * An update is available when the assessment found a newer matching release
 * (`available`) or a moved source revision (`changed`).
 */
const matchesFilter = (item: AssessedExtensionListItem, filter: ExtensionListFilter): boolean =>
  filter === "all" ||
  (filter === "outdated"
    ? item.assessment.state === "available" || item.assessment.state === "changed"
    : item.assessment.state === "deprecated");

/** An installed extension counts as checked once its assessment reached a verdict. */
const checkedStates: ReadonlyArray<AssessedExtensionListItem["assessment"]["state"]> = [
  "current",
  "available",
  "changed",
  "active",
  "deprecated",
];

const coverageFor = (items: ReadonlyArray<AssessedExtensionListItem>) => ({
  eligible: items.filter((item) => item.installed).length,
  checked: items.filter((item) => checkedStates.includes(item.assessment.state)).length,
  unknown: items.filter((item) => item.assessment.state === "unknown").length,
  notApplicable: items.filter((item) => item.assessment.state === "not-applicable").length,
});

export interface ListExtensionsResult {
  readonly document: ExtensionListDocument;
  /** The kept items with their full assessments, for rendering. */
  readonly items: ReadonlyArray<AssessedExtensionListItem>;
}

export const ListExtensions = {
  query: Effect.fn("ListExtensions.query")(function* (request: ListExtensionsRequest) {
    const collected = yield* collectExtensionListItems(request.types);
    const assessed =
      request.filter === "all"
        ? collected
        : yield* Effect.scoped(assessExtensionListItems(collected, request.filter));
    const items = assessed.filter((item) => matchesFilter(item, request.filter));
    const raw = yield* (yield* WorkspaceRecords).getInventory({ types: request.types ?? [] });
    const core = yield* buildInventoryDocument(raw);
    const documentItems = items.map((item) => {
      const observed = core.items.find(
        (candidate) => candidate.type === item.type && candidate.name === item.name,
      );
      if (observed === undefined)
        throw new Error("Inventory changed within its inspection read view");
      return { ...observed, assessment: item.assessment };
    });
    return {
      document: {
        ...inventoryEnvelope(documentItems, collected.length, request.filter),
        ...(request.filter === "all" ? {} : { coverage: coverageFor(assessed) }),
      },
      items,
    } satisfies ListExtensionsResult;
  }, withInspectionReadView),
};
