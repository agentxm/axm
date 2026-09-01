/**
 * Authentication requirements and grant bindings for exact publication.
 *
 * The feature never invokes authentication itself: it expresses the
 * requirement as typed precondition data and consumes the authorization
 * RESULT as a structural grant value. The application sequences the
 * registry-auth feature to satisfy the requirement and passes each issued
 * grant into the upload binding as data.
 */

import type { OperationPrecondition } from "@agentxm/workspace-operations";
import type { PublishVisibility } from "@agentxm/registry-protocol/unstable/publish";
import type {
  PublicationVisibilityInput,
  Sha256Hex,
} from "@agentxm/registry-protocol/unstable/registry";
import type { PublishExtensionArgs } from "@agentxm/registry-client";

/**
 * One exact publish capability the application obtained from the Registry
 * authorization flow. Structurally satisfied by the auth feature's issued
 * capability; this package never depends on that feature.
 */
export interface PublishGrant {
  readonly accessToken: string;
  readonly visibility: PublishVisibility;
  readonly condition: string;
  readonly publicationSetDigest: Sha256Hex;
  readonly publicationDescriptorDigest: Sha256Hex;
}

/** The authoritative preview facts one upload binds to. */
export interface ResolvedPublishPreview {
  readonly visibility: PublishVisibility;
  readonly visibilityInput: PublicationVisibilityInput;
  readonly condition?: string;
  readonly publicationSetDigest: string;
  readonly publicationDescriptorDigest: string;
}

export const publishAuthenticationPreconditions = (options: {
  readonly preview: boolean;
  readonly remoteRegistry: boolean;
  readonly authenticated: boolean;
  readonly hasPublishCandidates: boolean;
}): ReadonlyArray<OperationPrecondition> =>
  options.preview &&
  options.remoteRegistry &&
  !options.authenticated &&
  options.hasPublishCandidates
    ? [
        {
          id: "authentication",
          label: "Registry authentication",
          status: "unmet",
          detail:
            "Publishing requires human authorization before apply; authenticate before preparing a release workflow.",
          blockedOn: "human",
          command: "axm login --device-code --json",
        },
      ]
    : [];

export const exactPublishUploadBinding = (
  capability: PublishGrant,
  visibilityInput: PublicationVisibilityInput,
): Pick<
  PublishExtensionArgs,
  | "accessToken"
  | "condition"
  | "visibility"
  | "visibilityInput"
  | "publicationSetDigest"
  | "publicationDescriptorDigest"
> => ({
  accessToken: capability.accessToken,
  condition: capability.condition,
  publicationSetDigest: capability.publicationSetDigest,
  publicationDescriptorDigest: capability.publicationDescriptorDigest,
  visibilityInput,
  ...(capability.visibility.disposition === "establish"
    ? { visibility: capability.visibility }
    : {}),
});

export const previewPublishUploadBinding = (
  preview: ResolvedPublishPreview,
): Pick<
  PublishExtensionArgs,
  | "condition"
  | "visibility"
  | "visibilityInput"
  | "publicationSetDigest"
  | "publicationDescriptorDigest"
> => ({
  ...(preview.condition === undefined ? {} : { condition: preview.condition }),
  publicationSetDigest: preview.publicationSetDigest,
  publicationDescriptorDigest: preview.publicationDescriptorDigest,
  visibilityInput: preview.visibilityInput,
  ...(preview.visibility.disposition === "establish" ? { visibility: preview.visibility } : {}),
});
