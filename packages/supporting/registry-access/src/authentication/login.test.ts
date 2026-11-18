import * as DiagnosticsChannel from "node:diagnostics_channel";
import * as NodeHttp from "node:http";
import { NetworkDisabled, resolveUserAxmHome } from "@agentxm/host-primitives";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { recordTrace } from "../test-support/test-helpers.js";
import { DeviceLoginInteraction, DeviceLoginInteractionTest } from "./device-login.js";
import type { HumanHandoff } from "./login-presenter.js";
import { login, type LoginRequest } from "./login.js";
import {
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreLive,
  type PendingDeviceLogin,
} from "./pending-device-login-store.js";
import {
  authClientOver,
  authCredentialFile,
  authExpiry,
  authKey,
  authSelectedRegistry,
  deviceLoginRequest,
  makeAuthPorts,
  otherAuthKey,
  resumeLoginRequest,
} from "./test-support/test-helpers.js";

// Keep transport responses real through the generated decoder and failure mapper;
// only the wire and local storage/presentation ports are substituted.
describe("login after the Registry refuses a stored credential", () => {
  it.effect.each(["token_expired", "token_revoked", "unrecognized_refusal"])(
    "starts fresh device authorization after %s",
    (code) => {
      const requests: Array<string> = [];
      const wire = HttpClient.make((request) =>
        Effect.sync(() => {
          const path = new URL(request.url).pathname;
          requests.push(path);
          const response =
            path === "/v1/auth/me"
              ? Response.json(
                  {
                    type: "https://registry.agentxm.ai/v1/problems/token_ended",
                    title: "Token Ended",
                    status: 401,
                    detail: "The presented credential has ended.",
                    code,
                    tokenId: "fixture-token",
                    tokenPrefix: "axmt_fixture",
                    endedAt: "2026-10-15T00:00:00.000Z",
                  },
                  { status: 401 },
                )
              : Response.json({
                  device_code: "fixture-device-code",
                  user_code: "ABCD-1234",
                  verification_uri: "https://identity.example.test/device",
                  verification_uri_complete:
                    "https://identity.example.test/device?user_code=ABCD-1234",
                  interval: 5,
                  expires_in: 900,
                });
          return HttpClientResponse.fromWeb(request, response);
        }),
      );
      const ports = makeAuthPorts({ credentials: authCredentialFile });
      return Effect.gen(function* () {
        const result = yield* login(deviceLoginRequest(), authSelectedRegistry);
        expect(result._tag).toBe("PendingApproval");
        expect(requests).toEqual(["/v1/auth/me", "/v1/auth/device/code"]);
      }).pipe(Effect.provide(Layer.merge(ports.layer, authClientOver(wire))));
    },
  );
});

it.effect("offline refuses login before credential reads, listeners or HTTP", () => {
  const ports = makeAuthPorts();
  const wire = HttpClient.make(() => Effect.die("Offline login must not dispatch"));
  return Effect.gen(function* () {
    const result = yield* Effect.result(
      login({ ...deviceLoginRequest(), deviceCode: false }, authSelectedRegistry),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result))
      expect(result.failure).toMatchObject({
        _tag: "RegistryRequestFailed",
        category: "network",
        reason: "network-required",
        detail: expect.stringContaining("network-required"),
      });
  }).pipe(
    Effect.provide(Layer.merge(ports.layer, authClientOver(wire))),
    Effect.provideService(NetworkDisabled, true),
  );
});

/**
 * The live pending-sign-in store in a temporary AXM home, over a filesystem
 * that records every call, so a test can count how often one sign-in reads
 * the pending record. Everything else stays on the in-memory ports.
 */
const recordedPendingStore = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "axm-pending-login-" });
  const config = ConfigProvider.layer(ConfigProvider.fromEnvRecord({ AXM_USER_HOME: home }));
  const directory = yield* resolveUserAxmHome().pipe(Effect.provide(config));
  const file = path.join(directory, "pending-login.json");
  const liveStoreOver = (fileSystem: FileSystem.FileSystem) =>
    PendingDeviceLoginStoreLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(FileSystem.FileSystem, fileSystem),
          Layer.succeed(Path.Path, path),
          config,
        ),
      ),
    );
  const { fileSystem, recording } = makeRecordingFileSystem(fs);
  // Another invocation's store on the same file, unseen by the recording.
  const foreign = Context.get(yield* Layer.build(liveStoreOver(fs)), PendingDeviceLoginStore);
  const writeForeign = (record: PendingDeviceLogin) => foreign.save(record).pipe(Effect.orDie);
  return { layer: liveStoreOver(fileSystem), recording, directory, file, fs, writeForeign };
}).pipe(Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)));

const pendingRecord = (overrides: Partial<PendingDeviceLogin> = {}): PendingDeviceLogin => ({
  version: 3,
  registryUrl: authKey,
  deviceCode: "fixture-device-secret-pending",
  userCode: "WXYZ-9876",
  verificationUri: "https://identity.example.test/device",
  verificationUriComplete: "https://identity.example.test/device?user_code=WXYZ-9876",
  interval: 1,
  expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
  ...overrides,
});

/** An attended sign-in that names no flow. */
const attendedLogin = (overrides: Partial<LoginRequest> = {}) =>
  deviceLoginRequest({
    deviceCode: false,
    unattended: false,
    canAsk: true,
    machineOutput: false,
    ...overrides,
  });

/** A device code would only appear in one of these if the record leaked out. */
const leaks = (value: unknown) => JSON.stringify(value).includes("fixture-device-secret");

/** The Registry's loopback callback for an authorization request, as a browser would follow it. */
const followCallback = (authorizeUrl: string) =>
  Effect.promise(
    () =>
      new Promise<void>((resolve, reject) => {
        NodeHttp.get(authorizeUrl, (response) => {
          response.resume();
          response.on("end", resolve);
        }).on("error", reject);
      }),
  );

const loopbackAuth = {
  buildAuthorizeUrl: (
    _endpoint: unknown,
    input: { readonly redirectUri: string; readonly state: string },
  ) => {
    const callback = new URL(input.redirectUri);
    callback.searchParams.set("state", input.state);
    callback.searchParams.set("code", "fixture-code");
    callback.searchParams.set("iss", "https://agentxm.ai");
    return callback.href;
  },
  exchangePkceCode: () =>
    Effect.succeed({
      access_token: "fixture-loopback-access",
      refresh_token: "fixture-loopback-refresh",
      expires_at: authExpiry,
    }),
};

/** Fail the local callback server that receives a request, as a lost listener does. */
const failReceivingServer = (message: unknown) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "server" in message &&
    message.server instanceof NodeHttp.Server
  ) {
    message.server.emit("error", new Error("The local listener was lost."));
  }
};

/**
 * A browser that reaches the local callback server just as the server fails,
 * so the browser sign-in ends with the server's own failure and the device
 * fallback runs. `meanwhile` runs first, during the browser sign-in. The
 * device fallback's own page does not open.
 */
const failingListenerBrowser = (meanwhile: () => Effect.Effect<void> = () => Effect.void) =>
  DeviceLoginInteractionTest({
    openBrowser: (url) =>
      new URL(url).hostname === "127.0.0.1"
        ? meanwhile().pipe(
            Effect.andThen(
              Effect.acquireUseRelease(
                Effect.sync(() =>
                  DiagnosticsChannel.subscribe("http.server.request.start", failReceivingServer),
                ),
                () => followCallback(url),
                () =>
                  Effect.sync(() =>
                    DiagnosticsChannel.unsubscribe(
                      "http.server.request.start",
                      failReceivingServer,
                    ),
                  ),
              ),
            ),
            Effect.as(true),
          )
        : Effect.succeed(false),
  });

describe("one sign-in reads the pending record once per uninterrupted device flow", () => {
  type Scenario = {
    readonly name: string;
    readonly request: LoginRequest;
    readonly environment?: Record<string, string>;
    readonly preexisting?: PendingDeviceLogin;
    readonly reads: number;
    readonly outcome: "PendingApproval" | "SignedIn";
  };
  const scenarios: ReadonlyArray<Scenario> = [
    {
      name: "a named device wait reporting through machine output",
      request: resumeLoginRequest({ waitForHumanSeconds: 5 }),
      reads: 1,
      outcome: "SignedIn",
    },
    {
      name: "an attended device sign-in, which opens no browser",
      request: attendedLogin({ deviceCode: true }),
      reads: 1,
      outcome: "SignedIn",
    },
    {
      name: "an attended sign-in naming no flow that picks up a pending one",
      request: attendedLogin(),
      environment: { DISPLAY: ":0" },
      preexisting: pendingRecord(),
      reads: 1,
      outcome: "SignedIn",
    },
    {
      name: "an attended sign-in naming no flow where no browser can open",
      request: attendedLogin(),
      environment: { SSH_CONNECTION: "203.0.113.1 22 203.0.113.2 22" },
      reads: 1,
      outcome: "SignedIn",
    },
    {
      name: "an unattended sign-in naming no flow",
      request: deviceLoginRequest({ deviceCode: false }),
      reads: 1,
      outcome: "PendingApproval",
    },
    {
      name: "an unattended device sign-in that does not wait",
      request: deviceLoginRequest(),
      reads: 1,
      outcome: "PendingApproval",
    },
    {
      // The browser handoff runs between starting and waiting, so the wait reads again.
      name: "an attended wait that opens a browser",
      request: attendedLogin({ waitForHumanSeconds: 300 }),
      reads: 2,
      outcome: "SignedIn",
    },
  ];

  for (const scenario of scenarios) {
    it.effect(`${scenario.name} reads it ${String(scenario.reads)} time(s)`, () =>
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* recordedPendingStore;
          const ports = makeAuthPorts(
            scenario.environment === undefined ? {} : { environment: scenario.environment },
          );
          const run = Effect.gen(function* () {
            if (scenario.preexisting !== undefined) {
              yield* (yield* PendingDeviceLoginStore).save(scenario.preexisting);
            }
            store.recording.reset();
            const outcome = yield* login(scenario.request, authSelectedRegistry);
            expect(outcome._tag).toBe(scenario.outcome);
            expect(store.recording.contentReads(store.file)).toBe(scenario.reads);
            // The live store, not the in-memory one, held the record.
            if (outcome._tag === "PendingApproval") {
              expect(yield* store.fs.exists(store.file)).toBe(true);
            } else {
              expect(store.recording.counts(store.file).remove ?? 0).toBeGreaterThan(0);
            }
          });
          yield* run.pipe(Effect.provide(Layer.merge(ports.layer, store.layer)));
        }),
      ),
    );
  }

  it.effect("an attended sign-in naming no flow that completes in the browser reads it once", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* recordedPendingStore;
        const ports = makeAuthPorts({ environment: { DISPLAY: ":0" }, auth: loopbackAuth });
        const browser = DeviceLoginInteractionTest({
          openBrowser: (url) => followCallback(url).pipe(Effect.forkChild, Effect.as(true)),
        });
        const outcome = yield* login(attendedLogin(), authSelectedRegistry).pipe(
          Effect.provide(Layer.mergeAll(ports.layer, browser.layer, store.layer)),
        );
        expect(outcome._tag).toBe("SignedIn");
        expect(ports.deviceAuthorizations).toEqual([]);
        expect(store.recording.contentReads(store.file)).toBe(1);
      }),
    ),
  );

  it.effect("a device sign-in after the browser listener fails reads it three times", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* recordedPendingStore;
        const ports = makeAuthPorts({ environment: { DISPLAY: ":0" }, auth: loopbackAuth });
        const outcome = yield* login(attendedLogin(), authSelectedRegistry).pipe(
          Effect.provide(Layer.mergeAll(ports.layer, failingListenerBrowser().layer, store.layer)),
        );
        expect(outcome._tag).toBe("SignedIn");
        expect(ports.presenterState.deviceCodeFallbacks).toEqual(["loopback-bind-failed"]);
        expect(ports.polledCodes).toEqual(["fixture-device-secret-1"]);
        expect(store.recording.contentReads(store.file)).toBe(3);
      }),
    ),
  );
});

describe("a sign-in that reuses its own observation of the pending record", () => {
  const withStore = <A, E, R>(
    options: Parameters<typeof makeAuthPorts>[0],
    body: (
      store: Effect.Success<typeof recordedPendingStore>,
      ports: ReturnType<typeof makeAuthPorts>,
    ) => Effect.Effect<A, E, R>,
    extra?: Layer.Layer<DeviceLoginInteraction>,
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* recordedPendingStore;
        const ports = makeAuthPorts(options);
        return yield* body(store, ports).pipe(
          Effect.provide(Layer.mergeAll(ports.layer, extra ?? Layer.empty, store.layer)),
        );
      }),
    );

  it.effect("replaces an expired pending sign-in it observed and starts a new one", () =>
    withStore(
      { environment: { SSH_CONNECTION: "203.0.113.1 22 203.0.113.2 22" } },
      (store, ports) =>
        Effect.gen(function* () {
          yield* store.writeForeign(
            pendingRecord({ expiresAt: DateTime.makeUnsafe("1969-12-31T00:00:00.000Z") }),
          );
          const outcome = yield* login(attendedLogin(), authSelectedRegistry);
          expect(outcome._tag).toBe("SignedIn");
          expect(ports.deviceAuthorizations).toEqual(["fixture-device-secret-1"]);
          expect(ports.polledCodes).toEqual(["fixture-device-secret-1"]);
          expect(ports.presenterState.deviceCodeFallbacks).toEqual(["remote-or-headless"]);
        }),
    ),
  );

  it.effect("refuses to start while another Registry's sign-in is pending, as before", () =>
    withStore({}, (store, ports) =>
      Effect.gen(function* () {
        yield* store.writeForeign(pendingRecord({ registryUrl: otherAuthKey }));
        const failure = yield* Effect.flip(
          login(deviceLoginRequest({ deviceCode: false }), authSelectedRegistry),
        );
        expect(failure).toMatchObject({
          category: "conflict",
          detail: "A sign-in for other.example.test is already pending.",
        });
        expect(ports.deviceAuthorizations).toEqual([]);
        expect(store.recording.contentReads(store.file)).toBe(1);
      }),
    ),
  );

  it.effect("removes a corrupt pending record and fails once, at the first read", () =>
    withStore(
      { environment: { SSH_CONNECTION: "203.0.113.1 22 203.0.113.2 22" } },
      (store, ports) =>
        Effect.gen(function* () {
          yield* store.fs.makeDirectory(store.directory, { recursive: true });
          yield* store.fs.writeFileString(store.file, "{ not json");
          const failure = yield* Effect.flip(login(attendedLogin(), authSelectedRegistry));
          expect(failure).toMatchObject({
            category: "auth",
            detail: "Pending login storage was invalid and has been removed. Start a new sign-in.",
          });
          expect(store.recording.contentReads(store.file)).toBe(1);
          expect(store.recording.counts(store.file).remove).toBe(1);
          expect(yield* store.fs.exists(store.file)).toBe(false);
          expect(ports.deviceAuthorizations).toEqual([]);
        }),
    ),
  );

  it.effect("keeps the device code out of the pending outcome, the presenter and the trace", () => {
    const trace = recordTrace();
    return withStore({}, (_store, ports) =>
      Effect.gen(function* () {
        const outcome = yield* login(
          deviceLoginRequest({ deviceCode: false, machineOutput: false }),
          authSelectedRegistry,
        ).pipe(Effect.withTracer(trace.tracer), Effect.withTracerEnabled(true));
        expect(outcome._tag).toBe("PendingApproval");
        expect(ports.deviceAuthorizations).toEqual(["fixture-device-secret-1"]);
        expect(ports.presenterState.pendingApprovals).toHaveLength(1);
        expect(leaks(outcome)).toBe(false);
        expect(leaks(ports.presenterState)).toBe(false);
        expect(trace.spans.length).toBeGreaterThan(0);
        expect(
          leaks(trace.spans.map((span) => [span.name, Object.fromEntries(span.attributes)])),
        ).toBe(false);
      }),
    );
  });

  it.effect("waits on what it started with the same record a fresh read returns", () =>
    Effect.gen(function* () {
      // Millisecond precision in the expiry shows the record survives storage exactly.
      yield* TestClock.setTime(1_700_000_000_123);
      const handoffs: Array<HumanHandoff> = [];
      const recorded = { abandonWaits: true } as const;
      for (const waitForHumanSeconds of [undefined, 300]) {
        const stored = yield* withStore({ presenter: recorded }, (_store, ports) =>
          Effect.gen(function* () {
            // Without a named wait no browser opens; with one the browser opens first.
            yield* Effect.flip(
              login(
                attendedLogin(
                  waitForHumanSeconds === undefined
                    ? { deviceCode: true }
                    : { waitForHumanSeconds },
                ),
                authSelectedRegistry,
              ),
            );
            handoffs.push(...ports.presenterState.handoffs);
            return yield* (yield* PendingDeviceLoginStore).load();
          }),
        );
        expect(Option.isSome(stored)).toBe(true);
        const handoff = handoffs.at(-1);
        if (Option.isSome(stored) && handoff?._tag === "DeviceLogin") {
          expect(handoff).toMatchObject({
            userCode: stored.value.userCode,
            verificationUriComplete: stored.value.verificationUriComplete,
            verificationUri: stored.value.verificationUri,
            expiresAtMs: DateTime.toEpochMillis(stored.value.expiresAt),
          });
        } else {
          expect.fail("expected a device handoff and a kept pending record");
        }
      }
      expect(handoffs).toHaveLength(2);
      const [prepared, loaded] = handoffs;
      expect(prepared).toMatchObject({ expiresAtMs: 1_700_000_000_123 + 900_000 });
      expect({ ...prepared, browserOpened: false }).toEqual({ ...loaded, browserOpened: false });
    }),
  );

  it.effect("waits on a record another invocation put in place while the browser opened", () => {
    const storeRef: { write?: (record: PendingDeviceLogin) => Effect.Effect<void> } = {};
    const browser = DeviceLoginInteractionTest({
      openBrowser: () =>
        (storeRef.write?.(pendingRecord({ registryUrl: otherAuthKey })) ?? Effect.void).pipe(
          Effect.as(true),
        ),
    });
    return withStore(
      {},
      (store, ports) =>
        Effect.gen(function* () {
          storeRef.write = store.writeForeign;
          const failure = yield* Effect.flip(
            login(attendedLogin({ waitForHumanSeconds: 300 }), authSelectedRegistry),
          );
          expect(failure).toMatchObject({
            category: "conflict",
            detail: "The pending sign-in belongs to other.example.test, not registry.example.test.",
          });
          expect(ports.deviceAuthorizations).toEqual(["fixture-device-secret-1"]);
          expect(ports.polledCodes).toEqual([]);
          expect(store.recording.contentReads(store.file)).toBe(2);
        }),
      browser.layer,
    );
  });

  it.effect("starts its device fallback from a record put in place during browser sign-in", () => {
    const storeRef: { write?: (record: PendingDeviceLogin) => Effect.Effect<void> } = {};
    const browser = failingListenerBrowser(
      () => storeRef.write?.(pendingRecord({ registryUrl: otherAuthKey })) ?? Effect.void,
    );
    return withStore(
      { environment: { DISPLAY: ":0" }, auth: loopbackAuth },
      (store, ports) =>
        Effect.gen(function* () {
          storeRef.write = store.writeForeign;
          const failure = yield* Effect.flip(login(attendedLogin(), authSelectedRegistry));
          expect(failure).toMatchObject({
            category: "conflict",
            detail: "A sign-in for other.example.test is already pending.",
          });
          expect(ports.presenterState.deviceCodeFallbacks).toEqual(["loopback-bind-failed"]);
          expect(ports.deviceAuthorizations).toEqual([]);
          expect(store.recording.contentReads(store.file)).toBe(2);
        }),
      browser.layer,
    );
  });
});
