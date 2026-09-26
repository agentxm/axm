/**
 * Evidence an operation carries from resolution into its plan and its
 * resolution: the minimum-release-age holdback and bypass records, and the
 * Registry and source bindings a step proposes to accept.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

export interface ReleaseAgeRecordBase {
  readonly reason: "minimum-release-age";
  readonly target: string;
  readonly dependencyPath: ReadonlyArray<string>;
  readonly requestedRange?: string;
  readonly currentVersion?: string;
  readonly selectedVersion?: string;
  readonly candidateVersion: string;
  readonly publishedAt: string;
  readonly eligibleAt: string;
  readonly minimumReleaseAgeSeconds: number;
}

export type ReleaseAgeHoldbackRecord = ReleaseAgeRecordBase;

export type ReleaseAgeBypassRecord = ReleaseAgeRecordBase &
  (
    | {
        readonly bypassCause: "exclude";
        readonly exemptionScope: "project" | "user";
      }
    | {
        readonly bypassCause: "ignore-flag";
      }
  );

export type ReleaseAgeRecord = ReleaseAgeHoldbackRecord | ReleaseAgeBypassRecord;

export interface ReleaseAgeOperationEvidence {
  readonly evaluatedAt: string;
  readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
  readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
}

/**
 * The Registry identity a step proposes to accept. Trust classification
 * compares it with the accepted resolution for the same configured target,
 * so a change of publisher is identified from structured data rather than
 * from warning text.
 */
export interface RegistryBindingProposal {
  readonly extensionType: ExtensionType;
  /** The configured (local) name whose accepted resolution the step replaces. */
  readonly target: string;
  readonly owner: string;
  readonly packageName: string;
  readonly version: string;
  readonly publisherBindingId: string;
}

/**
 * A source acceptance proposed by a lifecycle plan step.
 *
 * The full ref stays inside the in-memory candidate. Public operation output
 * receives only the sanitized source-switch evidence derived from it.
 */
export interface SourceBindingProposal {
  readonly extensionType: ExtensionType;
  readonly target: string;
  readonly ref: ExtensionRef;
  /** Target Pack graph, when the proposal represents one atomic Pack switch. */
  readonly members?: ReadonlyArray<ExtensionRef>;
  /** Accepted Pack members from the exact graph the transition replaces. */
  readonly previousMembers?: ReadonlyArray<{
    readonly ref: ExtensionRef;
    readonly retained: boolean;
  }>;
}
