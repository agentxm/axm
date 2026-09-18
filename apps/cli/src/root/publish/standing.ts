import { formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type {
  PublishPublicationSet,
  PublishResult,
  PublishResultItem,
} from "@agentxm/workspace/publishing";

/** The stable display identity shared by publication rows, warnings, and links. */
export const publishIdentity = (item: Pick<PublishResultItem, "owner" | "type" | "name">): string =>
  formatFqn({ owner: item.owner, type: item.type, name: item.name });

export const versionedPublishIdentity = (item: PublishResultItem): string =>
  item.version === undefined ? publishIdentity(item) : `${publishIdentity(item)}@${item.version}`;

/** How one extension stands in both the ledger and the verdict tally. */
export type PublishStanding =
  | "to-publish"
  | "published"
  | "already-published"
  | "failed"
  | "unconfirmed"
  | "blocked"
  | "not-tried"
  | "skipped";

export type PublicationSetItem = PublishPublicationSet["items"][number];

export interface PlacedPublication {
  readonly item: PublishResultItem;
  readonly standing: PublishStanding;
  readonly setItem: PublicationSetItem | undefined;
}

/** Conditions that block their own extension rather than a dependent one. */
const OWN_CONDITION: ReadonlySet<PublishResultItem["reason"]> = new Set([
  "source_state_not_accepted",
  "stale_material",
]);

export const publishStandingOf = (
  item: PublishResultItem,
  mode: PublishResult["mode"],
): PublishStanding => {
  switch (item.status) {
    case "success":
      return item.action === "publish" ? "published" : "already-published";
    case "failed":
      return "failed";
    case "unknown":
      return "unconfirmed";
    case "blocked":
      return OWN_CONDITION.has(item.reason) ? "blocked" : "not-tried";
    case "skipped":
      return "skipped";
    case "pending":
      return mode === "preview" ? "to-publish" : "not-tried";
  }
};

export const distinct = (values: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(values),
];
