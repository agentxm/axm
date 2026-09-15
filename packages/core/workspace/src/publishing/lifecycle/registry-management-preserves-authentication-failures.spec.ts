import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { AuthLoginInteractionTest } from "@agentxm/registry-auth/testing";
import { defineSpecification } from "@agentxm/specification-metadata";

import { deprecate, undeprecate } from "./deprecation.js";
import { unyank, yank } from "./retirement.js";
import { reconcile, set, status } from "./visibility.js";
import {
  makePublishWorld,
  registryProblem,
  registryTarget,
  remotePublicationRegistry,
  type PublishWorld,
} from "../test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/registry-management-preserves-authentication-failures",
  title: "Registry management preserves authentication failures without reporting success",
  statement:
    "When a Registry lifecycle or visibility command receives an authentication rejection, AXM shall preserve the authentication failure, stop the operation without replaying the rejected request, and emit no successful result.",
  class: "functional",
  role: "experience",
  goals: ["privacy-and-consent"],
  methods: ["decision-table"],
  derivedFrom: ["AgentXM Registry API 0.1.0"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registryVersion = `${registryTarget}@1.2.3`;

/** No terminal and no pending request: an authentication rejection is terminal. */
const verification = { unattended: true } as const;

/** The category a typed feature failure carries, whichever family it belongs to. */
const categoryOf = (failure: unknown): string => {
  if (
    typeof failure === "object" &&
    failure !== null &&
    "category" in failure &&
    typeof failure.category === "string"
  ) {
    return failure.category;
  }
  throw new Error(`Expected a typed failure carrying a category, not ${String(failure)}`);
};

describe("Registry management authentication failures", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  /**
   * A published extension whose Registry answers every request with an
   * authentication rejection, over a workspace that declares a visibility
   * intent so reconcile has something to apply.
   */
  const rejectingWorld = () => {
    const requests: Array<{ readonly method: string; readonly url: string }> = [];
    const httpClient = HttpClient.make((request) =>
      Effect.sync(() => {
        requests.push({ method: request.method, url: request.url });
        return HttpClientResponse.fromWeb(request, registryProblem("auth", 401));
      }),
    );
    const world = makePublishWorld({
      httpClient,
      registryUrl: remotePublicationRegistry,
      settings: {
        skills: { review: "workspace" },
        publish: { defaultVisibility: "private" },
      },
    });
    worlds.push(world);
    world.write("skill", { name: "review" });
    return { world, requests };
  };

  const commands = [
    {
      name: "yank",
      run: () => yank({ ref: registryVersion, allVersions: false, verification }),
    },
    { name: "unyank", run: () => unyank(registryVersion, verification) },
    {
      name: "deprecate",
      run: () =>
        deprecate({
          ref: registryTarget,
          message: Option.some("Guidance."),
          replacement: Option.none(),
          clearMessage: false,
          clearReplacement: false,
        }),
    },
    { name: "undeprecate", run: () => undeprecate(registryTarget) },
    { name: "visibility status", run: () => status(registryTarget) },
    {
      name: "visibility set",
      run: () => set({ target: registryTarget, visibility: "private", verification }),
    },
    {
      name: "visibility reconcile",
      run: () => reconcile({ target: registryTarget, verification }),
    },
  ];

  for (const command of commands) {
    it.effect(command.name, () =>
      Effect.gen(function* () {
        const { world, requests } = rejectingWorld();

        type Invocation = ReturnType<(typeof command)["run"]>;
        const operation: Effect.Effect<
          unknown,
          Effect.Error<Invocation>,
          Effect.Services<Invocation>
        > = command.run();

        // Retirement writes sit behind the sign-in port; it is supplied so the
        // example fails on the Registry's rejection, never on a missing port.
        const failure = yield* world.provide(
          Effect.flip(operation).pipe(Effect.provide(AuthLoginInteractionTest().layer)),
        );

        // The authentication rejection reaches the caller as itself: it is not
        // reclassified, the rejected request is not replayed, and no
        // successful outcome is produced.
        expect(categoryOf(failure)).toBe("auth");
        expect(requests).toHaveLength(1);
      }),
    );
  }
});
