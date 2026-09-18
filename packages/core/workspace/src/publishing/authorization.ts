/**
 * Authentication requirements and upload bindings for publication.
 *
 * The publishing feature never invokes authentication itself: it expresses the
 * requirement as typed precondition data. Publishing is a write the person
 * makes as themselves, so the only credential an upload carries is the one the
 * application already resolved for the invocation.
 */

import type { OperationPrecondition } from "../transitions/planning/index.js";
import type { PublishVisibility } from "@agentxm/registry-protocol/unstable/publish";
import type { PublicationVisibilityInput } from "@agentxm/registry-protocol/unstable/registry";
import type { PublishExtensionArgs } from "@agentxm/registry-client";

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
          label: "Sign-in",
          status: "unmet",
          detail: "Publishing requires you to be signed in. Run `axm login`, then publish.",
          blockedOn: "human",
        },
      ]
    : [];

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
