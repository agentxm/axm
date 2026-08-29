import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleInstall } from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/non-installable-sources-do-not-mutate",
  title: "Install rejects a source it cannot install without changing the workspace",
  class: "functional",
  intents: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["property"],
});

/** Bare names: valid-looking identifiers that are not FQNs or locators. */
const bareName = FastCheck.stringMatching(/^[a-z][a-z0-9-]{0,30}$/);

describe("Non-installable install sources", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.prop(
    "any bare name fails as usage guidance and leaves the workspace untouched",
    [bareName],
    ([name]) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace();
        cleanups.push(workspace.cleanup);
        const settingsBefore = JSON.stringify(workspace.readSettings());
        const lockBefore = workspace.readLockfileText();

        const failure = yield* handleInstall({
          source: Option.some(name),
          yes: true,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer), Effect.flip);

        const error = getAppError(failure);
        expect(error.code).toBe("usage");

        expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
        expect(workspace.readLockfileText()).toBe(lockBefore);
        expect(workspace.exists("agent_extensions")).toBe(false);
      }),
    { fastCheck: { numRuns: 25 } },
  );

  it.effect("an unknown plural type in a registry name is rejected without mutation", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const settingsBefore = JSON.stringify(workspace.readSettings());

      const failure = yield* handleInstall({
        source: Option.some("@acme/widgets/thing"),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer), Effect.flip);

      const error = getAppError(failure);
      expect(["usage", "not_found"]).toContain(error.code);
      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      expect(workspace.exists("agent_extensions")).toBe(false);
    }),
  );
});
