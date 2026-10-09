import type {
  AuthLoginProgress,
  DeviceLoginPendingResult,
  HumanHandoff,
} from "@agentxm/registry-access/authentication";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import type { Doc, Span, WaitView } from "../../screen/index.js";
import { headlineDoc, paragraphDoc, successDoc } from "../../screen/index.js";

export interface AuthViewEntry {
  readonly doc: Doc;
  readonly instruction?: boolean;
}

/** Label of the lifecycle unit one sign-in phase runs as. */
export const authProgressLabel = (progress: AuthLoginProgress): string => {
  switch (progress._tag) {
    case "StartingDeviceAuthorization":
      return `sign-in code from ${progress.registryHost}`;
    case "SavingCredentials":
      return `credentials for ${progress.registryHost}`;
    case "CompletingSignIn":
      return `sign-in to ${progress.registryHost}`;
    case "CheckingRegistrySession":
    case "RevokingRegistrySession":
      return `registry session on ${progress.registryHost}`;
    case "ListingRegistryTokens":
      return "registry tokens";
  }
};

/**
 * Lifecycle unit id for one sign-in phase.
 */
export const authProgressUnitId = (progress: AuthLoginProgress): string => {
  switch (progress._tag) {
    case "CheckingRegistrySession":
      return "session";
    case "RevokingRegistrySession":
      return "revoke";
    case "ListingRegistryTokens":
      return "tokens";
    default:
      return progress._tag;
  }
};

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
      ? "This environment appears to be remote or headless; signing in with a code."
      : "Could not start a local callback server; signing in with a code instead.",
  ),
  instruction: true,
});

/** The page that carries the code already: the one a person is asked to open. */
const signInPageAction = (handoff: {
  readonly verificationUriComplete: string;
}): SuggestedAction => ({
  description: "Open the sign-in page",
  url: handoff.verificationUriComplete,
});

/** The clean page a person enters the code on by hand, offered second. */
const codeEntryPageAction = (handoff: { readonly verificationUri: string }): SuggestedAction => ({
  description: "Or open the sign-in page without the code and enter it",
  url: handoff.verificationUri,
});

/** The command that keeps waiting on a pending sign-in. */
const resumeAction = (result: DeviceLoginPendingResult): SuggestedAction => ({
  description: "Wait for the sign-in to finish",
  cmd: result.resume,
});

/** The pages of a pending sign-in, and the command that resumes waiting on it. */
export const pendingDeviceSuggestions = (
  result: DeviceLoginPendingResult,
): ReadonlyArray<SuggestedAction> => [
  signInPageAction(result),
  codeEntryPageAction(result),
  resumeAction(result),
];

export const loginSuccessSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  {
    description: "Create an API token in web settings",
    url: "https://agentxm.ai/u/settings/tokens",
  },
] satisfies ReadonlyArray<SuggestedAction>;

/** A value a person copies out of the terminal: never wrapped, split, or cut. */
const copyable = (label: string, value: string): ReadonlyArray<Span> => [
  { text: `${label}: ` },
  { text: value, copyable: true },
];

/**
 * What signing in from the terminal asks of a person, in the words the
 * browser's approval page uses: open the link, then check that the page shows
 * the same code. The link stands apart on its own line so it is never cut,
 * and the clean page for typing the code by hand follows as the one action.
 */
const terminalSignInBrief = (handoff: {
  readonly verificationUriComplete: string;
  readonly verificationUri: string;
  readonly userCode: string;
}): Doc => [
  { _tag: "paragraph", text: "To sign in, open this link in a browser:" },
  { _tag: "blank" },
  {
    _tag: "paragraph",
    inset: true,
    text: [{ text: handoff.verificationUriComplete, copyable: true }],
  },
  { _tag: "blank" },
  {
    _tag: "paragraph",
    text: [
      { text: "Make sure it shows the code " },
      { text: handoff.userCode, bold: true },
      { text: "." },
    ],
  },
  { _tag: "blank" },
  { _tag: "next", actions: [codeEntryPageAction(handoff)] },
];

/**
 * The block one handoff prints to the transcript when its wait opens: what a
 * person has to do, and the values they copy to do it. It is printed once,
 * never repainted, so nothing here is subject to the live region's width.
 */
const handoffBrief = (handoff: HumanHandoff): Doc => {
  switch (handoff._tag) {
    case "DeviceLogin":
      return terminalSignInBrief(handoff);
    case "LoopbackLogin":
      return [
        {
          _tag: "paragraph",
          text: handoff.browserOpened
            ? "Authorize AXM in the browser that just opened."
            : "Authorize AXM in a browser.",
        },
        {
          _tag: "next",
          actions: [{ description: "Authorize AXM", url: handoff.authorizeUrl }],
        },
        {
          _tag: "paragraph",
          tone: "dim",
          text: `Sign-in returns to ${handoff.redirectUri}. On a remote or headless machine, run \`axm login --device-code\`.`,
        },
      ];
    case "PublishAuthorization":
      return [
        {
          _tag: "paragraph",
          text: `Review ${String(handoff.candidateCount)} publish candidate${handoff.candidateCount === 1 ? "" : "s"} in the browser.`,
        },
        { _tag: "paragraph", text: copyable("Review URL", handoff.authorizationUrl) },
      ];
  }
};

/** What the live line says the terminal is parked on. */
const handoffStatus = (handoff: HumanHandoff): string => {
  switch (handoff._tag) {
    case "DeviceLogin":
      return "Waiting for you to sign in";
    case "LoopbackLogin":
      return `Waiting for browser sign-in on ${handoff.registryHost}`;
    case "PublishAuthorization":
      return "Waiting for your approval in the browser";
  }
};

/** The label the settled ✔ line carries, and the lifecycle unit the wait parks. */
const handoffLabel = (handoff: HumanHandoff): string => {
  switch (handoff._tag) {
    case "DeviceLogin":
      return "Terminal sign-in";
    case "LoopbackLogin":
      return "Browser sign-in";
    case "PublishAuthorization":
      return "Approved in browser";
  }
};

/**
 * What the person has to do, for the observers that see the wait rather than
 * the terminal: current activity, durable narration, and machine progress events.
 */
const handoffDetail = (handoff: HumanHandoff): string => {
  switch (handoff._tag) {
    case "DeviceLogin":
      return "approve the sign-in in a browser";
    case "LoopbackLogin":
      return "finish the sign-in in a browser";
    case "PublishAuthorization":
      return "approve the exact publication set in a browser";
  }
};

/** The lifecycle unit one handoff's wait parks, stable across its repaints. */
const handoffSubject = (handoff: HumanHandoff): string => {
  switch (handoff._tag) {
    case "DeviceLogin":
      return "device-authorization";
    case "LoopbackLogin":
      return "browser-authorization";
    case "PublishAuthorization":
      return "publish-authorization";
  }
};

/** One handoff as the `Screen` runs it: the brief, the live line, the settled line. */
export const handoffWaitView = (handoff: HumanHandoff): WaitView => ({
  subject: handoffSubject(handoff),
  detail: handoffDetail(handoff),
  label: handoffLabel(handoff),
  status: handoffStatus(handoff),
  brief: handoffBrief(handoff),
  expiresAtMs: handoff.expiresAtMs,
});

/**
 * The guidance a sign-in nothing will wait on still owes a person: the same
 * code and links the wait would have shown.
 */
export const pendingHandoffBrief = (result: DeviceLoginPendingResult): Doc =>
  terminalSignInBrief(result);

/**
 * The outcome that sign-in settled on, and the command that resumes it. The
 * pages to open came with the guidance above it, so only the resume is left.
 */
export const pendingApprovalDoc = (result: DeviceLoginPendingResult): Doc => [
  { _tag: "headline", tone: "warn", text: "Sign-in is waiting for you in the browser." },
  { _tag: "next", actions: [resumeAction(result)] },
];

/**
 * Who a sign-in signed in as, the way the browser names the account: by its
 * email address, else by its handle, else not at all.
 */
const signedInAs = (result: {
  readonly handle?: string | undefined;
  readonly email?: string | undefined;
}): string | undefined => result.email ?? result.handle;

export const loginSuccessDoc = (result: {
  readonly registryHost: string;
  readonly handle?: string | undefined;
  readonly email?: string | undefined;
}): Doc => {
  const account = signedInAs(result);
  return successDoc(
    account === undefined
      ? `Signed in to ${result.registryHost}`
      : `Signed in to ${result.registryHost} as ${account}`,
    { suggestions: loginSuccessSuggestions },
  );
};
export const loopbackStartView = (start: {
  readonly redirectUri: string;
  readonly authorizeUrl: string;
}): ReadonlyArray<AuthViewEntry> => [
  {
    doc: paragraphDoc(`Starting local sign-in server on ${start.redirectUri}.`),
    instruction: true,
  },
  {
    doc: paragraphDoc(
      `If the browser does not open, visit:\n\n${start.authorizeUrl}\n\nOn a remote or headless machine, run \`axm login --device-code\`.`,
    ),
    instruction: true,
  },
];

export const loopbackBrowserOutcomeView = (opened: boolean): AuthViewEntry =>
  opened
    ? { doc: headlineDoc("info", "Opening your browser to authorize AXM.") }
    : {
        doc: paragraphDoc(
          "Could not open the system browser. Use the authorization URL above to continue.",
        ),
        instruction: true,
      };
