/**
 * The CLI's redaction of its own failure shapes. The policy — which strings
 * are credentials and how they are erased — belongs to the Registry client;
 * these helpers apply it to the shapes only this application renders.
 */

import {
  collectSensitiveStrings,
  redactRegistryText,
  redactRegistryValue,
} from "@agentxm/registry-client";

import type { FailureMetadata } from "@agentxm/workspace/transitions/planning";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

/** Redact URL userinfo in addition to the general credential shapes. */
export const redactCredentialBearingLocator = (locator: string): string =>
  redactRegistryText(locator).replace(
    /([a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]+@/giu,
    "$1[REDACTED]@",
  );

export const redactAppErrorMetadata = (
  metadata: FailureMetadata,
  secrets: ReadonlyArray<string> = collectSensitiveStrings(metadata),
): FailureMetadata => ({
  ...(metadata.request === undefined
    ? {}
    : {
        request: {
          service: redactRegistryText(metadata.request.service, { secrets }),
          ...(metadata.request.method === undefined
            ? {}
            : { method: redactRegistryText(metadata.request.method, { secrets }) }),
          url: redactRegistryText(metadata.request.url, { secrets }),
        },
      }),
  ...(metadata.response === undefined
    ? {}
    : {
        response: {
          status: metadata.response.status,
          ...(metadata.response.requestId === undefined
            ? {}
            : { requestId: redactRegistryText(metadata.response.requestId, { secrets }) }),
          ...(metadata.response.problemCode === undefined
            ? {}
            : { problemCode: redactRegistryText(metadata.response.problemCode, { secrets }) }),
          ...(metadata.response.body === undefined
            ? {}
            : { body: redactRegistryValue(metadata.response.body, { secrets }) }),
        },
      }),
  ...(metadata.requestPolicy === undefined ? {} : { requestPolicy: metadata.requestPolicy }),
});

export const redactSuggestedAction = (
  suggestion: SuggestedAction,
  secrets: ReadonlyArray<string> = [],
): SuggestedAction => ({
  description: redactRegistryText(suggestion.description, { secrets }),
  ...(suggestion.cmd === undefined ? {} : { cmd: redactRegistryText(suggestion.cmd, { secrets }) }),
  ...(suggestion.url === undefined ? {} : { url: redactRegistryText(suggestion.url, { secrets }) }),
});
