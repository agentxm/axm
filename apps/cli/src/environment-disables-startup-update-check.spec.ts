import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { decodeStableChannelDocumentSync } from "@agentxm/extension-model/unstable/release-channel";
import { defineSpecification } from "@agentxm/specification-metadata";
import { rememberStableChannel } from "@agentxm/cli-maintenance/self-update/application";
import { StableChannelCheckLive } from "@agentxm/cli-maintenance/self-update/composition";
import { stableChannelDocument } from "@agentxm/cli-maintenance/self-update/testing";
import { UpdateCheckCacheLive } from "@agentxm/cli-update/live";
import { snapshotDirectory } from "@agentxm/cli-update/testing";
import { TestRenderer } from "./test-support/presenter-test.js";
import { withUpdateCheck } from "./update-check-startup.js";

export const specification = defineSpecification({
  requirement: "cli/environment-disables-startup-update-check",
  title: "The environment can disable the startup update check",
  statement:
    "When AXM_NO_UPDATE_CHECK is 1, AXM shall omit the informational startup update notification and its release requests regardless of output or interaction mode, while allowing an explicitly invoked command to perform its required network operations.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Must agent sessions always skip startup checks when AXM_NO_UPDATE_CHECK is not 1? Earlier environment help said they skip, but the current runtime and its internal test permit agent checks even without a TTY.",
    "Does suppression also prohibit reading an existing update cache, beyond the absence of requests and notifications promised here?",
  ],
  limitations: [
    {
      limitation:
        "The primary decision table uses a populated fresh cache and a controlled HTTP port; it establishes notification suppression and command-network independence, but does not by itself establish the absence of a background refresh when a cache is missing or stale.",
      retirementCondition:
        "Add a scheduler-coordinated missing/stale-cache control that observes the live startup wrapper's detached request and completion without wall-clock sleeps or leaked fibers.",
    },
  ],
});

const temporaryHome = () => fs.mkdtempSync(path.join(os.tmpdir(), "axm-startup-env-"));

const servicesFor = (home: string, disabled: boolean, http: HttpClient.HttpClient) => {
  const platform = Layer.mergeAll(
    NodeServices.layer,
    ConfigProvider.layer(
      ConfigProvider.fromEnv({
        env: { AXM_USER_HOME: home, AXM_NO_UPDATE_CHECK: disabled ? "1" : "0" },
      }),
    ),
  );
  const httpLayer = Layer.succeed(HttpClient.HttpClient, http);
  return Layer.mergeAll(
    platform,
    httpLayer,
    UpdateCheckCacheLive.pipe(Layer.provide(platform)),
    StableChannelCheckLive.pipe(Layer.provide(httpLayer)),
    TestRenderer.make().layer,
  );
};

describe("Startup update suppression", () => {
  for (const disabled of [true, false])
    for (const json of [false, true])
      for (const nonInteractive of [false, true])
        for (const tty of [false, true])
          for (const agent of [false, true]) {
            if (!disabled && (json || nonInteractive || !tty || agent)) continue;
            it.effect(
              `disabled=${disabled}, JSON=${json}, unattended=${nonInteractive}, TTY=${tty}, agent=${agent}`,
              () => {
                const home = temporaryHome();
                const requests: string[] = [];
                const notices: string[] = [];
                const http = HttpClient.make((request) =>
                  Effect.sync(() => {
                    requests.push(request.url);
                    return HttpClientResponse.fromWeb(request, new Response("command response"));
                  }),
                );
                return Effect.gen(function* () {
                  yield* rememberStableChannel(
                    decodeStableChannelDocumentSync(stableChannelDocument("2.0.0")),
                    null,
                  );
                  const before = snapshotDirectory(home);
                  const command = Effect.gen(function* () {
                    const client = yield* HttpClient.HttpClient;
                    return yield* (yield* client.get(
                      "https://command.example.test/required-operation",
                    )).text;
                  });
                  const response = yield* withUpdateCheck(command, {
                    localVersion: "1.0.0",
                    inputs: {
                      args: ["list"],
                      isJsonOutput: json,
                      isNonInteractive: nonInteractive,
                      isStderrTTY: tty,
                      isAgentSession: agent,
                    },
                    printNotification: (message) =>
                      Effect.sync(() => {
                        notices.push(message);
                      }),
                  });
                  if (disabled) expect(notices).toEqual([]);
                  else expect(notices).toEqual([expect.stringContaining("2.0.0")]);
                  expect(response).toBe("command response");
                  expect(requests).toEqual(["https://command.example.test/required-operation"]);
                  expect(snapshotDirectory(home)).toEqual(before);
                }).pipe(
                  Effect.provide(servicesFor(home, disabled, http)),
                  Effect.ensuring(
                    Effect.sync(() => fs.rmSync(home, { recursive: true, force: true })),
                  ),
                );
              },
            );
          }

  it.effect("without suppression, a missing cache reaches the real startup request path", () => {
    const home = temporaryHome();
    const requests: string[] = [];
    return Effect.gen(function* () {
      const observed = yield* Deferred.make<void>();
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          requests.push(request.url);
          const response = HttpClientResponse.fromWeb(request, new Response(null, { status: 503 }));
          yield* Deferred.succeed(observed, undefined);
          return response;
        }),
      );
      yield* withUpdateCheck(Deferred.await(observed), {
        localVersion: "1.0.0",
        inputs: {
          args: ["list"],
          isJsonOutput: false,
          isNonInteractive: false,
          isStderrTTY: true,
          isAgentSession: false,
        },
      }).pipe(Effect.provide(servicesFor(home, false, http)));
      expect(requests).toEqual(["https://releases.axm.sh/v1/channels/stable.json"]);
    }).pipe(Effect.ensuring(Effect.sync(() => fs.rmSync(home, { recursive: true, force: true }))));
  });
});
