/**
 * A source-resolution failure met while discovering what a source offers is
 * refused with the category, sentence, and evidence the kernel renders for
 * that failure, whichever extension type is being installed. No per-type
 * discovery decides a category of its own.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { RegistryProblem, RegistryRequestFailed } from "@agentxm/registry-client";

import { discoverHookRefs } from "../../hooks/lifecycle/install/plan.js";
import { discoverRuleRefs } from "../../instructions/lifecycle/install/plan.js";
import { discoverKnowledgeRefs } from "../../knowledge/lifecycle/install/plan.js";
import { discoverMcpServerRefs } from "../../mcp-connections/lifecycle/install/plan.js";
import { discoverPackRefs } from "../../packs/lifecycle/install/plan.js";
import { discoverSkillRefs } from "../../skills/lifecycle/install/plan.js";
import { discoverSubagentRefs } from "../../subagents/lifecycle/install/plan.js";
import { workspaceFailureToStepFailure } from "../../reconciliation/failure-rendering.js";
import { GitOperationFailed } from "../../resolution/sources/errors.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../../resolution/sources/service.js";
import type { SourceResolutionFailure } from "../../resolution/sources/index.js";
import { makeLifecycleFixture } from "../testing.js";

const registry: RegistrySource = {
  type: "registry",
  name: "test",
  location: new URL("https://registry.example.test"),
  owner: Option.none(),
};

const git = {
  type: "git",
  url: new URL("https://git.example.test/acme/extensions.git"),
  ref: Option.none(),
  subPath: Option.none(),
} as const;

const forbidden = new RegistryProblem({
  category: "forbidden",
  title: "Forbidden",
  detail: "You do not have access to @acme.",
  metadata: {
    request: { service: "registry", method: "GET", url: `${registry.location.href}v1/x` },
    response: { status: 403, requestId: "req_403" },
  },
});

/** Every per-type discovery, given one source. */
const discoveries = (source: RegistrySource | typeof git) =>
  [
    [
      "skill",
      discoverSkillRefs({
        source,
        versionRange: Option.none(),
        requestedSkills: ["review"],
        requestedOwner: Option.none(),
        resolutionProbes: [],
        all: false,
        force: false,
        nonInteractive: true,
      }),
    ],
    [
      "subagent",
      discoverSubagentRefs({
        source,
        versionRange: Option.none(),
        requestedSubagents: ["review"],
        requestedOwner: Option.none(),
        resolutionProbes: [],
        all: false,
        nonInteractive: true,
      }),
    ],
    [
      "rule",
      discoverRuleRefs({ source, names: [], owner: Option.none(), versionRange: Option.none() }),
    ],
    [
      "hook",
      discoverHookRefs({ source, names: [], owner: Option.none(), versionRange: Option.none() }),
    ],
    [
      "knowledge",
      discoverKnowledgeRefs({
        source,
        names: [],
        owner: Option.none(),
        versionRange: Option.none(),
      }),
    ],
    [
      "mcp-server",
      discoverMcpServerRefs({
        source,
        owner: Option.none(),
        serverName: Option.none(),
        versionRange: Option.none(),
      }),
    ],
    [
      "pack",
      discoverPackRefs({
        source: git,
        owner: Option.none(),
        packName: Option.none(),
        versionRange: Option.none(),
      }),
    ],
  ] as const;

/** A provider set whose every lookup meets the same failure. */
const refusing = (failure: SourceResolutionFailure): SourceHostProvidersService => ({
  find: () => Effect.fail(failure),
  resolveNamedRegistry: () => Effect.fail(failure),
  fetch: () => Effect.fail(failure),
  acquireForTransition: () => Effect.fail(failure),
  cloneUrl: () => Option.none(),
  origin: (source) => source.type,
});

describe("Source discovery failures read as the kernel renders them", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("refuses a Registry 403 as forbidden for every extension type", () =>
    Effect.gen(function* () {
      const fixture = makeLifecycleFixture({ settings: { agents: [] } });
      cleanups.push(fixture.cleanup);
      for (const [type, discovery] of discoveries(registry)) {
        const failure = yield* discovery.pipe(
          Effect.provideService(SourceHostProviders, refusing(forbidden)),
          Effect.scoped,
          fixture.provide,
          Effect.provide(NodeServices.layer),
          Effect.flip,
        );
        const rendered = workspaceFailureToStepFailure(failure);
        expect([type, rendered.category]).toEqual([type, "forbidden"]);
        expect(rendered.detail).toBe("You do not have access to @acme.");
        expect(rendered.metadata?.response?.status).toBe(403);
      }
    }),
  );

  it.effect("carries every other Registry refusal's own category", () =>
    Effect.gen(function* () {
      const fixture = makeLifecycleFixture({ settings: { agents: [] } });
      cleanups.push(fixture.cleanup);
      for (const [failure, category] of [
        [new RegistryRequestFailed({ category: "auth", detail: "Credentials rejected." }), "auth"],
        [new RegistryProblem({ category: "rate_limit", detail: "Slow down." }), "rate_limit"],
        [
          new RegistryRequestFailed({ category: "timeout", detail: "Deadline elapsed." }),
          "timeout",
        ],
      ] as const) {
        for (const [type, discovery] of discoveries(registry)) {
          const refused = yield* discovery.pipe(
            Effect.provideService(SourceHostProviders, refusing(failure)),
            Effect.scoped,
            fixture.provide,
            Effect.provide(NodeServices.layer),
            Effect.flip,
          );
          expect([type, workspaceFailureToStepFailure(refused).category]).toEqual([type, category]);
        }
      }
    }),
  );

  it.effect("refuses a Git fetch failure as a network failure for every extension type", () =>
    Effect.gen(function* () {
      const fixture = makeLifecycleFixture({ settings: { agents: [] } });
      cleanups.push(fixture.cleanup);
      const providers = refusing(
        new GitOperationFailed({ operation: "fetch-commit", detail: "Failed to fetch abc123" }),
      );
      for (const [type, discovery] of discoveries(git)) {
        const refused = yield* discovery.pipe(
          Effect.provideService(SourceHostProviders, providers),
          Effect.scoped,
          fixture.provide,
          Effect.provide(NodeServices.layer),
          Effect.flip,
        );
        expect([type, workspaceFailureToStepFailure(refused).category]).toEqual([type, "network"]);
      }
    }),
  );
});
