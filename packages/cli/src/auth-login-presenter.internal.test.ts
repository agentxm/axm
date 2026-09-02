/**
 * Unit tests for the renderer-backed auth login presenter.
 *
 * Owns the wording, suggestion-set, spinner-label, and machine-document
 * coverage relocated from the auth feature tests.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthLoginPresenter, type DeviceLoginPendingResult } from "@agentxm/registry-auth";
import { TestMachineRenderer, TestRenderer, logsByTag } from "./screen/index.js";
import { AuthLoginPresenterLive } from "./auth-login-presenter.js";

const pendingResult: DeviceLoginPendingResult = {
  status: "pending-human",
  blockedOn: "human",
  retryable: true,
  flow: "started",
  registryHost: "registry.agentxm.ai",
  verificationUri: "https://auth.agentxm.ai/device",
  verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
  requestedScopes: ["extensions:read"],
  userCode: "ABCD-1234",
  expiresAt: "2099-01-01T00:00:00.000Z",
  interval: 5,
  resume: "axm login --wait --json",
  action: {
    kind: "open-url",
    url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
    fallbackUrl: "https://auth.agentxm.ai/device",
    code: "ABCD-1234",
    expiresAt: "2099-01-01T00:00:00.000Z",
    resume: "axm login --wait --json",
  },
};

const pendingSuggestions = [
  {
    description: "Open the AXM device authorization page",
    url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
  },
  {
    description: "Open the clean fallback page and enter the code",
    url: "https://auth.agentxm.ai/device",
  },
  { description: "Resume after approval", cmd: "axm login --wait --json" },
];

const loginSuccessSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  { description: "Create an API token", cmd: "axm token create --name <name>" },
];

const makeHuman = () => {
  const renderer = TestRenderer.make();
  return {
    layer: Layer.provide(AuthLoginPresenterLive, renderer.layer),
    state: renderer.state,
    logs: logsByTag(renderer.state),
  };
};

const makeMachine = () => {
  const renderer = TestMachineRenderer.make();
  return {
    layer: Layer.provide(AuthLoginPresenterLive, renderer.layer),
    state: renderer.state,
    logs: logsByTag(renderer.state),
  };
};

describe("AuthLoginPresenterLive", () => {
  it.effect("presents the device flow with the sign-in wording and URL suggestions", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.presentDeviceFlow({
        verificationUri: "https://auth.agentxm.ai/device",
        verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        userCode: "ABCD-1234",
        expiresInSeconds: 600,
        browserOpened: true,
        copiedToClipboard: true,
      });

      expect(logs.info).toEqual([
        "Opening your browser to complete device authorization.",
        "Sign in to AgentXM.ai with a one-time code",
        "The one-time code was copied to your clipboard.",
        "One-time code:\n\n   ABCD-1234",
        "This code expires in 10 minutes.",
        "Only continue if you started this sign-in with AXM.",
        "Never enter a code that another person or website gave you. If that happened, cancel.",
      ]);
      expect(state.suggestions).toEqual([
        {
          description: "Open the AXM device authorization page",
          url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        },
        {
          description: "Open the clean fallback page and enter the code",
          url: "https://auth.agentxm.ai/device",
        },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("omits browser and clipboard hints when those side effects did not happen", () => {
    const { layer, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.presentDeviceFlow({
        verificationUri: "https://auth.agentxm.ai/device",
        verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        userCode: "ABCD-1234",
        expiresInSeconds: 90,
        browserOpened: false,
        copiedToClipboard: false,
      });

      expect(logs.info).toEqual([
        "Sign in to AgentXM.ai with a one-time code",
        "One-time code:\n\n   ABCD-1234",
        "This code expires in 90 seconds.",
        "Only continue if you started this sign-in with AXM.",
        "Never enter a code that another person or website gave you. If that happened, cancel.",
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("emits the pending document with suggestions in machine mode", () => {
    const { layer, state, logs } = makeMachine();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      const consumed = yield* presenter.tryEmitPendingDeviceLogin(pendingResult);

      expect(consumed).toBe(true);
      expect(state.results[0]?.data).toEqual({ result: pendingResult });
      expect(state.suggestions).toEqual(pendingSuggestions);
      expect(logs.info).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not consume the pending document in human mode", () => {
    const { layer, state } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      const consumed = yield* presenter.tryEmitPendingDeviceLogin(pendingResult);

      expect(consumed).toBe(false);
      expect(state.suggestions).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("notes pending approval with resume suggestions", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.notePendingApproval(pendingResult);

      expect(logs.success).toEqual(["Device sign-in is waiting for approval."]);
      expect(state.suggestions).toEqual(pendingSuggestions);
    }).pipe(Effect.provide(layer));
  });

  it.effect("emits the structured login document in machine mode", () => {
    const { layer, state, logs } = makeMachine();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.emitLoginSuccess({
        status: "logged-in",
        registryHost: "registry.agentxm.ai",
        handle: "@alice",
      });

      expect(state.results[0]?.data).toEqual({
        result: {
          status: "logged-in",
          registryHost: "registry.agentxm.ai",
          handle: "@alice",
        },
      });
      expect(state.suggestions).toEqual(loginSuccessSuggestions);
      expect(logs.success).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports login success with and without a handle in human mode", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.emitLoginSuccess({
        status: "logged-in",
        registryHost: "registry.agentxm.ai",
        handle: "@alice",
      });
      yield* presenter.emitLoginSuccess({
        status: "logged-in",
        registryHost: "registry.agentxm.ai",
      });

      expect(logs.success).toEqual([
        "Logged in to registry.agentxm.ai as @alice.",
        "Logged in to registry.agentxm.ai.",
      ]);
      expect(state.suggestions).toEqual([...loginSuccessSuggestions, ...loginSuccessSuggestions]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("labels each progress phase with the login spinner wording", () => {
    const { layer, state } = makeHuman();
    const registryHost = "registry.agentxm.ai";

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.withProgress(
        { _tag: "StartingDeviceAuthorization", registryHost },
        () => Effect.void,
      );
      yield* presenter.withProgress(
        { _tag: "WaitingForDeviceAuthorization", registryHost },
        () => Effect.void,
      );
      yield* presenter.withProgress({ _tag: "SavingCredentials", registryHost }, () => Effect.void);
      yield* presenter.withProgress(
        { _tag: "WaitingForLoopbackAuthorization", registryHost, timeoutMinutes: 5 },
        () => Effect.void,
      );
      yield* presenter.withProgress({ _tag: "CompletingSignIn", registryHost }, () => Effect.void);

      expect(state.spinnerMessages).toEqual([
        "Starting device authorization for registry.agentxm.ai",
        "Started device authorization for registry.agentxm.ai",
        "Waiting for authorization…",
        "Authorized device on registry.agentxm.ai",
        "Saving credentials for registry.agentxm.ai",
        "Saved credentials for registry.agentxm.ai",
        "Waiting for authorization… (expires in 5 minutes)",
        "Received browser authorization on registry.agentxm.ai",
        "Completing sign-in to registry.agentxm.ai",
        "Completed sign-in to registry.agentxm.ai",
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("announces the loopback flow and browser outcome", () => {
    const { layer, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.presentLoopbackStart({
        redirectUri: "http://127.0.0.1:3999/callback",
        authorizeUrl: "https://agentxm.ai/oauth/authorize?state=s1",
      });
      yield* presenter.noteLoopbackBrowserOutcome(true);
      yield* presenter.noteLoopbackBrowserOutcome(false);

      expect(logs.info).toEqual([
        "Starting local sign-in server on http://127.0.0.1:3999/callback.",
        "If the browser does not open, visit:\n\nhttps://agentxm.ai/oauth/authorize?state=s1\n\nOn a remote or headless machine, run `axm login --device-code`.",
        "Opening your browser to authorize AXM.",
        "Could not open the system browser. Use the authorization URL above to continue.",
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("frames the publish review step for browser and manual paths", () => {
    const { layer, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.notePublishReview({
        browserOpened: true,
        candidateCount: 1,
        authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_1",
      });
      yield* presenter.notePublishReview({
        browserOpened: true,
        candidateCount: 2,
        authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_2",
      });
      yield* presenter.notePublishReview({
        browserOpened: false,
        candidateCount: 1,
        authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_3",
      });

      expect(logs.step).toEqual([
        "Opening browser to review 1 publish candidate...",
        "Opening browser to review 2 publish candidates...",
        "Open this URL to review the exact publish: https://agentxm.ai/publish/authorize/pubreq_3",
      ]);
    }).pipe(Effect.provide(layer));
  });
});
