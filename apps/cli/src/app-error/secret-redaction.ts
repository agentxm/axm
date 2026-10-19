/**
 * The CLI's redaction of its own failure shapes. The policy — which strings
 * are credentials and how they are erased — belongs to host-primitives;
 * these helpers apply it to the shapes only this application renders.
 */

import {
  collectSensitiveStrings,
  redactCredentialText,
  redactCredentialValue,
} from "@agentxm/host-primitives";
import type { FailureMetadata } from "@agentxm/workspace-kernel/operations";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export const redactAppErrorMetadata = (
  metadata: FailureMetadata,
  secrets: ReadonlyArray<string> = collectSensitiveStrings(metadata),
): FailureMetadata => ({
  ...(metadata.request === undefined
    ? {}
    : {
        request: {
          service: redactCredentialText(metadata.request.service, { secrets }),
          ...(metadata.request.method === undefined
            ? {}
            : { method: redactCredentialText(metadata.request.method, { secrets }) }),
          url: redactCredentialText(metadata.request.url, { secrets }),
        },
      }),
  ...(metadata.response === undefined
    ? {}
    : {
        response: {
          status: metadata.response.status,
          ...(metadata.response.requestId === undefined
            ? {}
            : { requestId: redactCredentialText(metadata.response.requestId, { secrets }) }),
          ...(metadata.response.problemCode === undefined
            ? {}
            : { problemCode: redactCredentialText(metadata.response.problemCode, { secrets }) }),
          ...(metadata.response.body === undefined
            ? {}
            : { body: redactCredentialValue(metadata.response.body, { secrets }) }),
        },
      }),
  ...(metadata.requestPolicy === undefined ? {} : { requestPolicy: metadata.requestPolicy }),
});

export const redactSuggestedAction = (
  suggestion: SuggestedAction,
  secrets: ReadonlyArray<string> = [],
): SuggestedAction => ({
  description: redactCredentialText(suggestion.description, { secrets }),
  ...(suggestion.cmd === undefined
    ? {}
    : { cmd: redactCredentialText(suggestion.cmd, { secrets }) }),
  ...(suggestion.url === undefined
    ? {}
    : { url: redactCredentialText(suggestion.url, { secrets }) }),
});
