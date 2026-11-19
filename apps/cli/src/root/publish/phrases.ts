/**
 * The words publish uses for its own decisions: what each extension will do,
 * how it ended, which phase is running, where visibility came from, and why a
 * publish was held. Only publish speaks them, so they live with publish.
 */
import { count } from "../../screen/index.js";

const unreachable = (value: never): never => {
  throw new Error(`Unrecognized publish vocabulary: ${String(value)}`);
};

type PublishParticipation = "publish" | "verified-existing";

/**
 * What a publish plan ledger says an extension will do: be uploaded, or be
 * skipped because the registry already holds that exact version.
 */
export const publishParticipation = (value: PublishParticipation): string => {
  switch (value) {
    case "publish":
      return "publish";
    case "verified-existing":
      return "skip";
    default:
      return unreachable(value);
  }
};

/** Why a publish row skips an extension the registry already holds. */
export const ALREADY_PUBLISHED = "already published";

/** What a publish result row says became of an extension. */
export const publishOutcome = (
  value: "published" | "failed" | "unconfirmed" | "blocked" | "skipped",
): string => {
  switch (value) {
    case "published":
      return "published";
    case "failed":
      return "failed";
    case "unconfirmed":
      return "unconfirmed";
    case "blocked":
      return "blocked";
    case "skipped":
      return "skip";
    default:
      return unreachable(value);
  }
};

export type PublishPhase =
  | "selection"
  | "authoritative_preflight"
  | "authorization"
  | "dependency_execution"
  | "upload_execution";

export const publishPhase = (value: PublishPhase): string => {
  switch (value) {
    case "selection":
      return "selection";
    case "authoritative_preflight":
      return "authoritative preflight";
    case "authorization":
      return "authorization";
    case "dependency_execution":
      return "dependency execution";
    case "upload_execution":
      return "upload";
    default:
      return unreachable(value);
  }
};

export type PublishVisibilitySource =
  "manifest" | "workspace" | "explicit" | "account" | "platform" | "existing";

/**
 * Where an extension's visibility came from: set by an input for a new
 * extension, or kept from the publication the registry already holds.
 */
export const publishVisibilityOrigin = (
  disposition: "establish" | "preserve",
  source: PublishVisibilitySource,
): string => {
  const from = (() => {
    switch (source) {
      case "manifest":
        return "the manifest";
      case "workspace":
        return "workspace settings";
      case "explicit":
        return "the command";
      case "account":
        return "account settings";
      case "platform":
        return "platform defaults";
      case "existing":
        return "the existing publication";
      default:
        return unreachable(source);
    }
  })();
  return `${disposition === "establish" ? "from" : "kept from"} ${from}`;
};

/** A Git revision as a person compares it: the short form Git itself prints. */
const shortRevision = (revision: string): string => revision.slice(0, 7);

/** How an extension's source relates to the Git HEAD the archive was compared with. */
export const publishSourceState = (
  status: "matches-head" | "differs-from-head" | "no-head",
  revision: string | undefined,
): string => {
  switch (status) {
    case "matches-head":
      return revision === undefined
        ? "matches Git HEAD"
        : `matches Git HEAD ${shortRevision(revision)}`;
    case "differs-from-head":
      return revision === undefined
        ? "differs from Git HEAD"
        : `differs from Git HEAD ${shortRevision(revision)}`;
    case "no-head":
      return "no Git HEAD to compare with";
    default:
      return unreachable(status);
  }
};

/** The archive paths that keep a working tree from matching Git HEAD. */
export const publishSourceDifferences = (differenceCount: number): string =>
  `${count(differenceCount, "path")} ${differenceCount === 1 ? "differs" : "differ"} from HEAD`;

type PublishDisposition =
  "included" | "excluded" | "unmanaged" | "not-authored" | "not-publishable" | "unmatched";

export const publishDisposition = (value: PublishDisposition): string => {
  switch (value) {
    case "included":
      return "included";
    case "excluded":
      return "excluded by selection";
    case "unmanaged":
      return "not managed by this workspace";
    case "not-authored":
      return "not authored here";
    case "not-publishable":
      return "not publishable";
    case "unmatched":
      return "did not match";
    default:
      return unreachable(value);
  }
};

type PublishReason =
  | "selected"
  | "excluded"
  | "unmanaged"
  | "unmatched_selector"
  | "version_already_published"
  | "not_authored"
  | "not_publishable"
  | "invalid_workspace_source"
  | "authorization_failed"
  | "authoritative_preflight_failed"
  | "dependency_unavailable"
  | "candidate_invalid"
  | "stale_material"
  | "publish_precondition_changed"
  | "deleting"
  | "held"
  | "archived"
  | "upload_failed"
  | "integrity_conflict"
  | "settlement_unresolved"
  | "authorization_expired"
  | "blocked_by_dependency"
  | "interrupted"
  | "blocked_by_preflight"
  | "source_state_not_accepted";

export const publishReason = (value: PublishReason): string => {
  switch (value) {
    case "selected":
      return "selected";
    case "excluded":
      return "excluded";
    case "unmanaged":
      return "not managed by this workspace";
    case "unmatched_selector":
      return "selector did not match";
    case "version_already_published":
      return "version already published";
    case "not_authored":
      return "not authored here";
    case "not_publishable":
      return "not publishable";
    case "invalid_workspace_source":
      return "workspace source is invalid";
    case "authorization_failed":
      return "authorization failed";
    case "authoritative_preflight_failed":
      return "authoritative preflight failed";
    case "dependency_unavailable":
      return "dependency unavailable";
    case "candidate_invalid":
      return "candidate is invalid";
    case "stale_material":
      return "source material changed";
    case "publish_precondition_changed":
      return "publish precondition changed";
    case "deleting":
      return "extension deletion is in progress";
    case "held":
      return "extension name is held";
    case "archived":
      return "extension is archived";
    case "upload_failed":
      return "upload failed";
    case "integrity_conflict":
      return "published content has different integrity";
    case "settlement_unresolved":
      return "registry settlement could not be verified";
    case "authorization_expired":
      return "authorization expired";
    case "blocked_by_dependency":
      return "blocked by a dependency";
    case "interrupted":
      return "interrupted";
    case "blocked_by_preflight":
      return "blocked by preflight";
    case "source_state_not_accepted":
      return "source state was not accepted";
    default:
      return unreachable(value);
  }
};
