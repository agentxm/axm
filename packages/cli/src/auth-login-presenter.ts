/**
 * CLI implementation of the auth login presentation seam.
 *
 * Owns all sign-in wording, suggestion sets, spinner labels, and machine-mode
 * document emission for the device, loopback, and publish-authorization
 * flows.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  AuthLoginPresenter,
  DeviceLoginPendingDocumentSchema,
  LoginDocumentSchema,
  type AuthLoginPresenterService,
  type AuthLoginProgress,
  type DeviceLoginPendingResult,
} from "@agentxm/registry-auth";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";

const progressMessages = (
  progress: AuthLoginProgress,
): { readonly message: string; readonly successMessage: string } => {
  switch (progress._tag) {
    case "StartingDeviceAuthorization":
      return {
        message: `Starting device authorization for ${progress.registryHost}`,
        successMessage: `Started device authorization for ${progress.registryHost}`,
      };
    case "WaitingForDeviceAuthorization":
      return {
        message: "Waiting for authorization…",
        successMessage: `Authorized device on ${progress.registryHost}`,
      };
    case "SavingCredentials":
      return {
        message: `Saving credentials for ${progress.registryHost}`,
        successMessage: `Saved credentials for ${progress.registryHost}`,
      };
    case "WaitingForLoopbackAuthorization":
      return {
        message: `Waiting for authorization… (expires in ${progress.timeoutMinutes} minutes)`,
        successMessage: `Received browser authorization on ${progress.registryHost}`,
      };
    case "CompletingSignIn":
      return {
        message: `Completing sign-in to ${progress.registryHost}`,
        successMessage: `Completed sign-in to ${progress.registryHost}`,
      };
  }
};

const pendingSuggestions = (result: DeviceLoginPendingResult): ReadonlyArray<SuggestedAction> => [
  {
    description: "Open the AXM device authorization page",
    url: result.verificationUriComplete,
  },
  {
    description: "Open the clean fallback page and enter the code",
    url: result.verificationUri,
  },
  {
    description: "Resume after approval",
    cmd: result.resume,
  },
];

const loginSuccessSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  { description: "Create an API token", cmd: "axm token create --name <name>" },
] satisfies ReadonlyArray<SuggestedAction>;

export const AuthLoginPresenterLive = Layer.effect(
  AuthLoginPresenter,
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    return {
      withProgress: <A, E, R>(progress: AuthLoginProgress, run: () => Effect.Effect<A, E, R>) => {
        const { message, successMessage } = progressMessages(progress);
        return renderer.withSpinner(message, () => run(), { successMessage });
      },
      tryEmitPendingDeviceLogin: (result) =>
        Effect.gen(function* () {
          return yield* renderer.result({ result }, DeviceLoginPendingDocumentSchema, {
            suggestions: pendingSuggestions(result),
          });
        }),
      presentDeviceFlow: (presentation) =>
        Effect.gen(function* () {
          if (presentation.browserOpened) {
            yield* renderer.info("Opening your browser to complete device authorization.");
          }
          const expiry =
            presentation.expiresInSeconds % 60 === 0
              ? `${presentation.expiresInSeconds / 60} ${presentation.expiresInSeconds === 60 ? "minute" : "minutes"}`
              : `${presentation.expiresInSeconds} seconds`;
          yield* renderer.instruction("Sign in to AgentXM.ai with a one-time code");
          yield* renderer.suggestions([
            {
              description: "Open the AXM device authorization page",
              url: presentation.verificationUriComplete,
            },
            {
              description: "Open the clean fallback page and enter the code",
              url: presentation.verificationUri,
            },
          ]);
          if (presentation.copiedToClipboard) {
            yield* renderer.info("The one-time code was copied to your clipboard.");
          }
          yield* renderer.instruction(`One-time code:\n\n   ${presentation.userCode}`);
          yield* renderer.instruction(`This code expires in ${expiry}.`);
          yield* renderer.instruction("Only continue if you started this sign-in with AXM.");
          yield* renderer.instruction(
            "Never enter a code that another person or website gave you. If that happened, cancel.",
          );
        }),
      notePendingApproval: (result) =>
        renderer.success("Device sign-in is waiting for approval.", {
          suggestions: pendingSuggestions(result),
        }),
      emitLoginSuccess: (result) =>
        Effect.gen(function* () {
          if (
            yield* renderer.result({ result }, LoginDocumentSchema, {
              suggestions: loginSuccessSuggestions,
            })
          ) {
            return;
          }
          yield* renderer.success(
            result.handle === undefined
              ? `Logged in to ${result.registryHost}.`
              : `Logged in to ${result.registryHost} as ${result.handle}.`,
            { suggestions: loginSuccessSuggestions },
          );
        }),
      presentLoopbackStart: (start) =>
        Effect.gen(function* () {
          yield* renderer.instruction(`Starting local sign-in server on ${start.redirectUri}.`);
          yield* renderer.instruction(
            `If the browser does not open, visit:\n\n${start.authorizeUrl}\n\nOn a remote or headless machine, run \`axm login --device-code\`.`,
          );
        }),
      noteLoopbackBrowserOutcome: (opened) =>
        opened
          ? renderer.info("Opening your browser to authorize AXM.")
          : renderer.instruction(
              "Could not open the system browser. Use the authorization URL above to continue.",
            ),
      notePublishReview: (review) =>
        renderer.step(
          review.browserOpened
            ? `Opening browser to review ${review.candidateCount} publish candidate${review.candidateCount === 1 ? "" : "s"}...`
            : `Open this URL to review the exact publish: ${review.authorizationUrl}`,
        ),
    } satisfies AuthLoginPresenterService;
  }),
);
