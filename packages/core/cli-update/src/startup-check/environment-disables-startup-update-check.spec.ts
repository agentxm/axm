import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";

import { decodeStableChannelDocumentSync } from "@agentxm/extension-model/unstable/release-channel";
import { defineSpecification } from "@agentxm/specification-metadata";

import { UpdateCheck } from "../update-check/update-check.js";
import { UpdateCheckLive } from "../live.js";
import { StartupUpdateCheck } from "./startup-check.js";
import { snapshotDirectory } from "../testing.js";
import { stableChannelDocument } from "@agentxm/cli-maintenance/self-update/testing";

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
                const platform = Layer.mergeAll(
                  NodeServices.layer,
                  ConfigProvider.layer(
                    ConfigProvider.fromEnv({
                      env: { AXM_USER_HOME: home, AXM_NO_UPDATE_CHECK: disabled ? "1" : "0" },
                    }),
                  ),
                );
                const http = HttpClient.make((request) =>
                  Effect.sync(() => {
                    requests.push(request.url);
                    return HttpClientResponse.fromWeb(request, new Response("command response"));
                  }),
                );
                const services = Layer.mergeAll(
                  platform,
                  Layer.succeed(HttpClient.HttpClient, http),
                  UpdateCheckLive.pipe(Layer.provide(platform)),
                );
                return Effect.gen(function* () {
                  const cache = yield* UpdateCheck;
                  yield* cache.writeCache(
                    decodeStableChannelDocumentSync(stableChannelDocument("2.0.0")),
                    null,
                  );
                  const before = snapshotDirectory(home);

                  const outcome = yield* StartupUpdateCheck.run({
                    localVersion: "1.0.0",
                    context: {
                      isJsonOutput: json,
                      isUpgradeCommand: false,
                      isNonInteractive: nonInteractive,
                      isStderrTTY: tty,
                      isAgentSession: agent,
                    },
                  });

                  if (disabled) {
                    expect(outcome._tag).toBe("Skipped");
                  } else {
                    expect(outcome._tag).toBe("Checked");
                    const notification =
                      outcome._tag === "Checked" ? outcome.notification : Option.none();
                    expect(Option.isSome(notification)).toBe(true);
                    expect(Option.getOrThrow(notification).message).toContain("2.0.0");
                  }

                  // A command the person explicitly invoked still reaches the
                  // network it needs; only the startup check is suppressed.
                  const client = yield* HttpClient.HttpClient;
                  const response = yield* (yield* client.get(
                    "https://command.example.test/required-operation",
                  )).text;
                  expect(response).toBe("command response");
                  expect(requests).toEqual(["https://command.example.test/required-operation"]);
                  expect(snapshotDirectory(home)).toEqual(before);
                }).pipe(
                  Effect.provide(services),
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
      const platform = Layer.mergeAll(
        NodeServices.layer,
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home, AXM_NO_UPDATE_CHECK: "0" } }),
        ),
      );
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          requests.push(request.url);
          // No cache write follows a refused HTTP response, keeping the observed
          // detached refresh free of a subsequent asynchronous storage lifetime.
          const response = HttpClientResponse.fromWeb(request, new Response(null, { status: 503 }));
          yield* Deferred.succeed(observed, undefined);
          return response;
        }),
      );
      const services = Layer.mergeAll(
        platform,
        Layer.succeed(HttpClient.HttpClient, http),
        UpdateCheckLive.pipe(Layer.provide(platform)),
      );
      yield* Effect.gen(function* () {
        const outcome = yield* StartupUpdateCheck.run({
          localVersion: "1.0.0",
          context: {
            isJsonOutput: false,
            isUpgradeCommand: false,
            isNonInteractive: false,
            isStderrTTY: true,
            isAgentSession: false,
          },
        });
        expect(outcome).toMatchObject({ _tag: "Checked", refreshing: true });
        yield* Deferred.await(observed);
      }).pipe(Effect.provide(services));
      expect(requests).toEqual(["https://releases.axm.sh/v1/channels/stable.json"]);
    }).pipe(Effect.ensuring(Effect.sync(() => fs.rmSync(home, { recursive: true, force: true }))));
  });
});
