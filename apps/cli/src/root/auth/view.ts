import type {
  AuthLoginProgress,
  DeviceLoginPendingResult,
  HumanHandoff,
} from "@agentxm/registry-access/authentication";
import { handoffUrl } from "@agentxm/registry-access/authentication";
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
      return `device authorization on ${progress.registryHost}`;
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
      ? "This environment appears to be remote or headless; using device-code sign-in."
      : "Could not start a local callback server; using device-code sign-in instead.",
  ),
  instruction: true,
});

/**
 * The two pages a device sign-in offers: the one that carries the code
 * already, and the clean one for entering it by hand. Machine output emits
 * them as suggestions, so an agent reaches the same two places a person does.
 */
const deviceHandoffActions = (handoff: {
  readonly verificationUriComplete: string;
  readonly verificationUri: string;
}): ReadonlyArray<SuggestedAction> => [
  {
    description: "Open the AXM device authorization page",
    url: handoff.verificationUriComplete,
  },
  { description: "Open the clean fallback page and enter the code", url: handoff.verificationUri },
];

/** The pages of a pending sign-in, and the command that resumes waiting on it. */
export const pendingDeviceSuggestions = (
  result: DeviceLoginPendingResult,
): ReadonlyArray<SuggestedAction> => [
  ...deviceHandoffActions(result),
  { description: "Resume after approval", cmd: result.resume },
];

export const loginSuccessSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  {
    description: "Create an API token in web settings",
    url: "https://agentxm.ai/u/settings/tokens",
  },
] satisfies ReadonlyArray<SuggestedAction>;

/**
 * The security wording a one-time code always carries. A person who did not
 * start this sign-in is the case it exists for, so it is never abbreviated
 * and never left to a link.
 */
const DEVICE_CODE_WARNINGS = [
  "Only continue if you started this sign-in with AXM.",
  "Never enter a code that another person or website gave you. If that happened, cancel.",
] as const;

/** A value a person copies out of the terminal: never wrapped, split, or cut. */
const copyable = (label: string, value: string): ReadonlyArray<Span> => [
  { text: `${label}: ` },
  { text: value, copyable: true },
];

/**
 * The block one handoff prints to the transcript when its wait opens: what a
 * person has to do, and the values they copy to do it. It is printed once,
 * never repainted, so nothing here is subject to the live region's width.
 */
const handoffBrief = (handoff: HumanHandoff): Doc => {
  switch (handoff._tag) {
    case "DeviceLogin":
      return [
        { _tag: "paragraph", text: "Sign in to AgentXM.ai with a one-time code." },
        { _tag: "paragraph", text: copyable("One-time code", handoff.userCode) },
        ...(handoff.copiedToClipboard
          ? [
              {
                _tag: "paragraph",
                tone: "dim",
                text: "The code was copied to your clipboard.",
              } as const,
            ]
          : []),
        { _tag: "next", actions: deviceHandoffActions(handoff) },
        ...DEVICE_CODE_WARNINGS.map(
          (warning) => ({ _tag: "paragraph", tone: "warn", text: warning }) as const,
        ),
      ];
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
      return `Waiting for approval on ${handoff.registryHost}`;
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
      return "Device sign-in";
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

/** What `c` copies while one handoff's wait stands open. */
export const handoffCopyValue = (handoff: HumanHandoff): string =>
  handoff._tag === "DeviceLogin" ? handoff.userCode : handoffUrl(handoff);

/**
 * The guidance a sign-in nothing will wait on still owes a person: the same
 * code, links, and warnings the wait would have shown.
 */
export const pendingHandoffBrief = (result: DeviceLoginPendingResult): Doc =>
  handoffBrief({
    _tag: "DeviceLogin",
    registryHost: result.registryHost,
    verificationUriComplete: result.verificationUriComplete,
    verificationUri: result.verificationUri,
    userCode: result.userCode,
    expiresAtMs: Date.parse(result.expiresAt),
    browserOpened: false,
    copiedToClipboard: false,
  });

/**
 * The outcome that sign-in settled on, and the command that resumes it. The
 * pages to open came with the guidance above it, so only the resume is left.
 */
export const pendingApprovalDoc = (result: DeviceLoginPendingResult): Doc => [
  { _tag: "headline", tone: "warn", text: "Device sign-in is waiting for approval." },
  {
    _tag: "next",
    actions: [{ description: "Resume after approval", cmd: result.resume }],
  },
];

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
