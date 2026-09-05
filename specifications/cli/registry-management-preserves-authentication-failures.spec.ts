import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  handleDeprecate,
  handleUndeprecate,
  handleUnyank,
  handleVisibilityReconcile,
  handleVisibilitySet,
  handleVisibilityStatus,
  handleYank,
} from "axm.sh/specification-harness";
import {
  makeRegistryManagementContext,
  registryProblem,
  registryTarget,
  registryVersion,
} from "../support/registry-management-harness.js";
import { makeVisibilityWorkspace } from "../support/visibility-harness.js";

export const specification = defineSpecification({
  requirement: "cli/registry-management-preserves-authentication-failures",
  title: "Registry management preserves authentication failures without reporting success",
  statement:
    "When a Registry lifecycle or visibility command receives an authentication rejection, AXM shall preserve the authentication failure, stop the operation without replaying the rejected request, and emit no successful result.",
  class: "functional",
  role: "experience",
  goals: ["privacy-and-consent"],
  methods: ["decision-table"],
  derivedFrom: [
    "AgentXM Registry API 0.1.0",
    "packages/cli/src/root/lifecycle/command.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Registry management authentication failures", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const commands = [
    {
      name: "yank",
      run: () =>
        handleYank({
          ref: registryVersion,
          allVersions: false,
          category: Option.none(),
          notice: Option.none(),
        }),
    },
    { name: "unyank", run: () => handleUnyank(registryVersion) },
    {
      name: "deprecate",
      run: () =>
        handleDeprecate({
          ref: registryTarget,
          message: Option.some("Guidance."),
          replacement: Option.none(),
          clearMessage: false,
          clearReplacement: false,
        }),
    },
    { name: "undeprecate", run: () => handleUndeprecate(registryTarget) },
    { name: "visibility status", run: () => handleVisibilityStatus(registryTarget) },
    { name: "visibility set", run: () => handleVisibilitySet(registryTarget, "private") },
    { name: "visibility reconcile", run: () => handleVisibilityReconcile(registryTarget) },
  ];
  for (const command of commands) {
    it.effect(command.name, () =>
      Effect.gen(function* () {
        const workspace = makeVisibilityWorkspace({ manifest: "private" });
        cleanups.push(workspace.cleanup);
        const context = makeRegistryManagementContext(() => registryProblem("auth", 401));
        type Invocation = ReturnType<(typeof commands)[number]["run"]>;
        const operation: Effect.Effect<
          void,
          Effect.Error<Invocation>,
          Effect.Services<Invocation>
        > = command.run();
        const error = yield* operation.pipe(
          Effect.flip,
          context.provide,
          Effect.provide(workspace.layer),
        );
        expect(error).toMatchObject({ _tag: "AppError", code: "auth" });
        expect(context.requests).toHaveLength(1);
        expect(context.rendererState.results).toEqual([]);
      }),
    );
  }
});
