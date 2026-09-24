/**
 * A source-resolution failure met while discovering what a source offers is
 * refused with the category, sentence, and evidence the kernel renders for
 * that failure, whichever extension type is being installed. No per-type
 * discovery decides a category of its own.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import type * as Config from "effect/Config";
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
import type { ExtensionLifecycleFailed } from "../errors.js";
import { makeLifecycleFixture } from "../testing.js";
import type { ResolveInstallRequirements } from "./vocabulary.js";

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
  cause: undefined,
});

type Discovery = Effect.Effect<
  void,
  ExtensionLifecycleFailed | Config.ConfigError,
  ResolveInstallRequirements
>;

/** Every per-type discovery, given one source; what each finds is not the question. */
const discoveries = (
  source: RegistrySource | typeof git,
): ReadonlyArray<readonly [string, Discovery]> => [
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
    }).pipe(Effect.asVoid),
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
    }).pipe(Effect.asVoid),
  ],
  [
    "rule",
    discoverRuleRefs({
      source,
      names: [],
      owner: Option.none(),
      versionRange: Option.none(),
    }).pipe(Effect.asVoid),
  ],
  [
    "hook",
    discoverHookRefs({
      source,
      names: [],
      owner: Option.none(),
      versionRange: Option.none(),
    }).pipe(Effect.asVoid),
  ],
  [
    "knowledge",
    discoverKnowledgeRefs({
      source,
      names: [],
      owner: Option.none(),
      versionRange: Option.none(),
    }).pipe(Effect.asVoid),
  ],
  [
    "mcp-server",
    discoverMcpServerRefs({
      source,
      owner: Option.none(),
      serverName: Option.none(),
      versionRange: Option.none(),
    }).pipe(Effect.asVoid),
  ],
  [
    "pack",
    discoverPackRefs({
      source: git,
      owner: Option.none(),
      packName: Option.none(),
      versionRange: Option.none(),
    }).pipe(Effect.asVoid),
  ],
];

/** A provider set whose every lookup meets the same failure. */
const refusing = (failure: SourceResolutionFailure): SourceHostProvidersService => ({
  find: () => Effect.fail(failure),
  resolveNamedRegistry: () => Effect.fail(failure),
  fetch: () => Effect.fail(failure),
  acquireForTransition: () => Effect.fail(failure),
  cloneUrl: () => Option.none(),
  origin: (source) => source.type,
});

/** The kernel's rendering of what one discovery refused with. */
const refusal = (
  discovery: Discovery,
  providers: SourceHostProvidersService,
  fixture: ReturnType<typeof makeLifecycleFixture>,
) =>
  discovery.pipe(
    Effect.provideService(SourceHostProviders, providers),
    Effect.scoped,
    fixture.provide,
    Effect.provide(NodeServices.layer),
    Effect.flip,
    Effect.map(workspaceFailureToStepFailure),
  );

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
        const rendered = yield* refusal(discovery, refusing(forbidden), fixture);
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
        [
          new RegistryProblem({
            category: "rate_limit",
            detail: "Slow down.",
            metadata: { response: { status: 429 } },
            cause: undefined,
          }),
          "rate_limit",
        ],
        [
          new RegistryRequestFailed({ category: "timeout", detail: "Deadline elapsed." }),
          "timeout",
        ],
      ] as const) {
        for (const [type, discovery] of discoveries(registry)) {
          const rendered = yield* refusal(discovery, refusing(failure), fixture);
          expect([type, rendered.category]).toEqual([type, category]);
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
        const rendered = yield* refusal(discovery, providers, fixture);
        expect([type, rendered.category]).toEqual([type, "network"]);
      }
    }),
  );
});
