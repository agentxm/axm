import type { AuthLoginProgress, DeviceLoginPendingResult } from "@agentxm/registry-auth";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import type { Doc } from "../../screen/index.js";
import { headlineDoc, paragraphDoc, successDoc, suggestionsDoc } from "../../screen/index.js";

export interface AuthViewEntry {
  readonly doc: Doc;
  readonly persistent?: boolean;
}

/** Label of the lifecycle unit one sign-in phase runs as. */
export const authProgressLabel = (progress: AuthLoginProgress): string => {
  switch (progress._tag) {
    case "StartingDeviceAuthorization":
      return `device authorization on ${progress.registryHost}`;
    case "WaitingForDeviceAuthorization":
      return `authorization on ${progress.registryHost}`;
    case "SavingCredentials":
      return `credentials for ${progress.registryHost}`;
    case "WaitingForLoopbackAuthorization":
      return `browser authorization on ${progress.registryHost} (expires in ${String(progress.timeoutMinutes)} minutes)`;
    case "CompletingSignIn":
      return `sign-in to ${progress.registryHost}`;
    case "CheckingRegistrySession":
    case "RevokingRegistrySession":
      return `registry session on ${progress.registryHost}`;
    case "ListingRegistryTokens":
      return "registry tokens";
    case "RunningVerifiedWrite":
    case "RetryingVerifiedWrite":
    case "WaitingForHumanVerification":
      return progress.operation;
  }
};

/**
 * Lifecycle unit id for one sign-in or verification phase. Ids name the work,
 * not the progress tag, so a retry reads as a distinct unit.
 */
export const authProgressUnitId = (progress: AuthLoginProgress): string => {
  switch (progress._tag) {
    case "CheckingRegistrySession":
      return "session";
    case "RevokingRegistrySession":
      return "revoke";
    case "ListingRegistryTokens":
      return "tokens";
    case "RunningVerifiedWrite":
      return "operation";
    case "RetryingVerifiedWrite":
      return "operation-retry";
    case "WaitingForHumanVerification":
      return "step-up-verification";
    default:
      return progress._tag;
  }
};

/** The guidance a person needs while one step-up verification is pending. */
export const stepUpChallengeView = (challenge: {
  readonly action: string;
  readonly target: string;
  readonly verificationUrl: string;
  readonly expiresAt: string;
  readonly browserOpened: boolean;
}): ReadonlyArray<AuthViewEntry> =>
  [
    `Action: ${challenge.action}`,
    `Target: ${challenge.target}`,
    `Verify at: ${challenge.verificationUrl}`,
    `Verification expires at: ${challenge.expiresAt}`,
    challenge.browserOpened
      ? "A browser was opened. This command will retry once after verification."
      : "Open the verification URL in a browser. This command will retry once after verification.",
  ].map((instruction) => ({ doc: paragraphDoc(instruction), persistent: true }));

/** The one question a session that is still valid raises. */
export const existingSessionNote = (handle: string): AuthViewEntry => ({
  doc: headlineDoc("info", `Already logged in as ${handle}.`),
});

export const rejectedStoredCredentialsNote: AuthViewEntry = {
  doc: headlineDoc("info", "Your saved credentials are no longer valid. Starting a new sign-in…"),
};

export const deviceCodeFallbackNote = (
  reason: "remote-or-headless" | "loopback-bind-failed",
): AuthViewEntry => ({
  doc: paragraphDoc(
    reason === "remote-or-headless"
      ? "This environment appears to be remote or headless; using device-code sign-in."
      : "Could not start a local callback server; using device-code sign-in instead.",
  ),
  persistent: true,
});

export const pendingDeviceSuggestions = (
  result: DeviceLoginPendingResult,
): ReadonlyArray<SuggestedAction> => [
  { description: "Open the AXM device authorization page", url: result.verificationUriComplete },
  { description: "Open the clean fallback page and enter the code", url: result.verificationUri },
  { description: "Resume after approval", cmd: result.resume },
];

export const loginSuccessSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  { description: "Create an API token", cmd: "axm token create --name <name>" },
] satisfies ReadonlyArray<SuggestedAction>;

export const deviceFlowView = (presentation: {
  readonly browserOpened: boolean;
  readonly expiresInSeconds: number;
  readonly verificationUriComplete: string;
  readonly verificationUri: string;
  readonly copiedToClipboard: boolean;
  readonly userCode: string;
}): ReadonlyArray<AuthViewEntry> => {
  const expiry =
    presentation.expiresInSeconds % 60 === 0
      ? `${presentation.expiresInSeconds / 60} ${presentation.expiresInSeconds === 60 ? "minute" : "minutes"}`
      : `${presentation.expiresInSeconds} seconds`;
  return [
    ...(presentation.browserOpened
      ? [{ doc: headlineDoc("info", "Opening your browser to complete device authorization.") }]
      : []),
    { doc: paragraphDoc("Sign in to AgentXM.ai with a one-time code"), persistent: true },
    {
      doc: suggestionsDoc([
        {
          description: "Open the AXM device authorization page",
          url: presentation.verificationUriComplete,
        },
        {
          description: "Open the clean fallback page and enter the code",
          url: presentation.verificationUri,
        },
      ]),
    },
    ...(presentation.copiedToClipboard
      ? [{ doc: headlineDoc("info", "The one-time code was copied to your clipboard.") }]
      : []),
    ...[
      `One-time code:\n\n   ${presentation.userCode}`,
      `This code expires in ${expiry}.`,
      "Only continue if you started this sign-in with AXM.",
      "Never enter a code that another person or website gave you. If that happened, cancel.",
    ].map((instruction) => ({ doc: paragraphDoc(instruction), persistent: true })),
  ];
};

export const pendingApprovalDoc = (result: DeviceLoginPendingResult): Doc =>
  successDoc("Device sign-in is waiting for approval.", {
    suggestions: pendingDeviceSuggestions(result),
  });

export const loginSuccessDoc = (result: {
  readonly registryHost: string;
  readonly handle?: string | undefined;
}): Doc =>
  successDoc(
    result.handle === undefined
      ? `Logged in to ${result.registryHost}.`
      : `Logged in to ${result.registryHost} as ${result.handle}.`,
    { suggestions: loginSuccessSuggestions },
  );

export const loopbackStartView = (start: {
  readonly redirectUri: string;
  readonly authorizeUrl: string;
}): ReadonlyArray<AuthViewEntry> => [
  {
    doc: paragraphDoc(`Starting local sign-in server on ${start.redirectUri}.`),
    persistent: true,
  },
  {
    doc: paragraphDoc(
      `If the browser does not open, visit:\n\n${start.authorizeUrl}\n\nOn a remote or headless machine, run \`axm login --device-code\`.`,
    ),
    persistent: true,
  },
];

export const loopbackBrowserOutcomeView = (opened: boolean): AuthViewEntry =>
  opened
    ? { doc: headlineDoc("info", "Opening your browser to authorize AXM.") }
    : {
        doc: paragraphDoc(
          "Could not open the system browser. Use the authorization URL above to continue.",
        ),
        persistent: true,
      };

export const publishReviewDoc = (review: {
  readonly browserOpened: boolean;
  readonly candidateCount: number;
  readonly authorizationUrl: string;
}): Doc =>
  headlineDoc(
    "info",
    review.browserOpened
      ? `Opening browser to review ${review.candidateCount} publish candidate${review.candidateCount === 1 ? "" : "s"}...`
      : `Open this URL to review the exact publish: ${review.authorizationUrl}`,
  );
