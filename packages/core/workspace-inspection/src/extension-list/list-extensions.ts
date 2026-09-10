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
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import {
  assessExtensionListItems,
  collectExtensionListItems,
  type ExtensionListFilter,
  type ExtensionListItem,
} from "./assessment.js";

const ListFilterSchema = Schema.Literals(["all", "outdated", "deprecated"] as const);

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

const ExtensionListItemSchema = Schema.Struct({
  ref: Schema.String,
  type: ExtensionTypeSchema,
  name: Schema.String,
  management: Schema.Literals(["configured", "implicit", "unmanaged"] as const),
  installed: Schema.Boolean,
  enabled: Schema.NullOr(Schema.Boolean),
  version: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String),
  sourceName: Schema.optional(Schema.String),
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
  filter: ListFilterSchema,
  items: Schema.Array(ExtensionListItemSchema),
  count: Schema.Number,
  totalCount: Schema.Number,
  coverage: Schema.optional(CoverageSchema),
});
export type ExtensionListDocument = typeof ExtensionListDocumentSchema.Type;

export interface ListExtensionsRequest {
  /** Restrict the inventory to one extension type. */
  readonly type?: InstallableExtensionType;
  /** Which extensions the answer keeps. Exactly one filter is in force. */
  readonly filter: ExtensionListFilter;
}

/**
 * An update is available when the assessment found a newer matching release
 * (`available`) or a moved source revision (`changed`).
 */
const matchesFilter = (item: ExtensionListItem, filter: ExtensionListFilter): boolean =>
  filter === "all" ||
  (filter === "outdated"
    ? item.assessment.state === "available" || item.assessment.state === "changed"
    : item.assessment.state === "deprecated");

/** An installed extension counts as checked once its assessment reached a verdict. */
const checkedStates: ReadonlyArray<ExtensionListItem["assessment"]["state"]> = [
  "current",
  "available",
  "changed",
  "active",
  "deprecated",
];

const coverageFor = (items: ReadonlyArray<ExtensionListItem>) => ({
  eligible: items.filter((item) => item.installed).length,
  checked: items.filter((item) => checkedStates.includes(item.assessment.state)).length,
  unknown: items.filter((item) => item.assessment.state === "unknown").length,
  notApplicable: items.filter((item) => item.assessment.state === "not-applicable").length,
});

/** The whole-inventory view names deprecation but does not carry its detail. */
const withoutDeprecationDetail = (item: ExtensionListItem): ExtensionListItem => {
  const { deprecation: _deprecation, ...assessment } = item.assessment;
  return { ...item, assessment };
};

export interface ListExtensionsResult {
  readonly document: ExtensionListDocument;
  /** The kept items with their full assessments, for rendering. */
  readonly items: ReadonlyArray<ExtensionListItem>;
}

export const ListExtensions = {
  query: Effect.fn("ListExtensions.query")(function* (request: ListExtensionsRequest) {
    const collected = yield* collectExtensionListItems(request.type);
    // The assessment always runs one of the two lifecycle checks; the whole
    // inventory view reports what deprecation found without filtering on it.
    const assessmentFilter = request.filter === "outdated" ? "outdated" : "deprecated";
    const assessed = yield* Effect.scoped(assessExtensionListItems(collected, assessmentFilter));
    const items = assessed
      .filter((item) => matchesFilter(item, request.filter))
      .map((item) => (request.filter === "all" ? withoutDeprecationDetail(item) : item));
    return {
      document: {
        filter: request.filter,
        items,
        count: items.length,
        totalCount: collected.length,
        ...(request.filter === "all" ? {} : { coverage: coverageFor(assessed) }),
      },
      items,
    } satisfies ListExtensionsResult;
  }),
};
