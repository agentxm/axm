import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { VisibilityEvaluationSchema } from "@agentxm/registry-protocol/unstable/publish";
import { handleVisibilityStatus } from "axm.sh/specification-harness";
import {
  jsonRegistryResponse,
  makeRegistryManagementContext,
  registryTarget,
  registryTargetPath,
} from "../../../support/registry-management-harness.js";
import {
  makeVisibilityWorkspace,
  visibilityEvaluation,
  visibilityIntent,
} from "../../../support/visibility-harness.js";

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
    "packages/cli/src/root/visibility/handler.ts",
    "packages/registry-protocol/src/unstable/publish/visibility.ts",
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
        const workspace = makeVisibilityWorkspace(scenario.source);
        cleanups.push(workspace.cleanup);
        const evaluation = visibilityEvaluation(scenario.intent);
        const context = makeRegistryManagementContext(() => jsonRegistryResponse(evaluation));
        yield* handleVisibilityStatus(registryTarget).pipe(
          context.provide,
          Effect.provide(workspace.layer),
        );
        expect(context.requests).toHaveLength(1);
        const request = context.requests[0];
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
        expect(context.rendererState.results).toHaveLength(1);
        const output = yield* Schema.decodeUnknownEffect(VisibilityEvaluationSchema)(
          context.rendererState.results[0]?.data,
        );
        expect(output).toEqual(evaluation);
      }),
    );
  }
});
