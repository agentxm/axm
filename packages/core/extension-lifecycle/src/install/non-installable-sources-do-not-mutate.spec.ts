import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { ExtensionLifecycleFailed } from "../errors.js";
import { applyInstall, installRequest, makeInstallWorld, readSettings } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/non-installable-sources-do-not-mutate",
  title: "Install rejects a source it cannot install without changing the workspace",
  statement:
    "When the install source is a bare name or names an unknown extension type, the install shall fail with usage guidance or a not-found outcome and shall not change settings, the lockfile, or workspace content.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["property"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether an unknown extension type in a registry name fails as usage guidance or as not found is undecided; the scenario accepts either outcome.",
  ],
});

/** Bare names: valid-looking identifiers that are not FQNs or locators. */
const bareName = FastCheck.stringMatching(/^[a-z][a-z0-9-]{0,30}$/);

describe("Non-installable install sources", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.prop(
    "any bare name fails as usage guidance and leaves the workspace untouched",
    [bareName],
    ([name]) => {
      const { workspace, cleanup } = makeInstallWorld();
      cleanups.push(cleanup);
      const settingsBefore = JSON.stringify(readSettings(workspace));
      const lockBefore = workspace.readFile("axm-lock.yaml");
      return workspace
        .provide(
          Effect.gen(function* () {
            const failure = yield* applyInstall(
              installRequest({ subject: { kind: "source", source: name } }),
            ).pipe(Effect.flip);

            expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
            if (failure instanceof ExtensionLifecycleFailed) {
              expect(failure.category).toBe("usage");
            }
            expect(JSON.stringify(readSettings(workspace))).toBe(settingsBefore);
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
            expect(workspace.exists("agent_extensions")).toBe(false);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { fastCheck: { numRuns: 25 } },
  );

  it.effect("an unknown plural type in a registry name is rejected without mutation", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);
    const settingsBefore = JSON.stringify(readSettings(workspace));
    return workspace
      .provide(
        Effect.gen(function* () {
          const failure = yield* applyInstall(
            installRequest({ subject: { kind: "source", source: "@acme/widgets/thing" } }),
          ).pipe(Effect.flip);

          expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
          if (failure instanceof ExtensionLifecycleFailed) {
            expect(["usage", "not_found"]).toContain(failure.category);
          }
          expect(JSON.stringify(readSettings(workspace))).toBe(settingsBefore);
          expect(workspace.exists("agent_extensions")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
