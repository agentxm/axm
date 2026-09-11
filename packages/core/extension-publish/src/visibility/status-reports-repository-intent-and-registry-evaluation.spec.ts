import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { VisibilityEvaluationSchema } from "@agentxm/registry-protocol/unstable/publish";

import { status } from "../lifecycle/visibility.js";
import { registryTarget, registryTargetPath } from "../test-helpers.js";
import { jsonRegistryResponse } from "../test-helpers.js";
import { makeVisibilityWorld, visibilityEvaluation, visibilityIntent } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/visibility/status/reports-repository-intent-and-registry-evaluation",
  title: "Visibility status supplies repository intent and reports the Registry evaluation",
  statement:
    "For a project-scoped visibility status request, AXM shall submit the manifest visibility intent when present, otherwise the workspace default when present, otherwise no intent, and report the selected extension's Registry evaluation through the AgentXM Registry API 0.1.0 contract.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["decision-table", "contract"],
  derivedFrom: [
    "apps/cli/src/root/visibility/handler.ts",
    "packages/core/registry-protocol/src/unstable/publish/visibility.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Visibility intent precedence", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const cases = [
    {
      name: "manifest overrides workspace",
      source: { manifest: "private", workspace: "public" },
      intent: visibilityIntent("manifest", "private"),
    },
    {
      name: "workspace supplies the default",
      source: { workspace: "private" },
      intent: visibilityIntent("workspace", "private"),
    },
    { name: "absent intent remains absent", source: {}, intent: null },
  ] as const;

  for (const scenario of cases) {
    it.effect(scenario.name, () =>
      Effect.gen(function* () {
        const evaluation = visibilityEvaluation(scenario.intent);
        const world = makeVisibilityWorld(() => jsonRegistryResponse(evaluation), scenario.source);
        cleanups.push(world.cleanup);

        const reported = yield* world.provide(status(registryTarget));

        expect(world.requests).toHaveLength(1);
        const request = world.requests[0];
        expect(request?.method).toBe("GET");
        expect(request?.url.pathname).toBe(`${registryTargetPath}/visibility`);
        expect(Object.fromEntries(request?.url.searchParams ?? [])).toEqual(
          scenario.intent === null
            ? {}
            : {
                intent_visibility: scenario.intent.value,
                intent_source: scenario.intent.source,
                intent_fingerprint: scenario.intent.fingerprint,
              },
        );
        const encoded = yield* Schema.encodeUnknownEffect(VisibilityEvaluationSchema)(reported);
        expect(encoded).toEqual(evaluation);
      }),
    );
  }
});
