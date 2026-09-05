import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  LOCAL_VERSION,
  TARGET_VERSION,
  indexOfEvent,
  runUpgrade,
  unitResolvedLabel,
  unitStartLabel,
} from "../../support/upgrade-harness.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/discloses-resolved-ownership-before-mutation",
  title: "Upgrade discloses the installer it resolved and the version it selected before mutating",
  statement:
    "Upgrade shall disclose the install method it detected and the version it selected before it performs the first mutation, and shall disclose both without performing any mutation when asked for a preview.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/upgrade/ownership-precedes-release-selection"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Upgrade ownership disclosure", () => {
  it.effect("names the detected method and the selected version before the first mutation", () =>
    Effect.gen(function* () {
      const { events } = yield* runUpgrade();

      expect(unitResolvedLabel(events, "detect-install-method")).toBe(
        "AXM installed with Homebrew",
      );
      expect(unitResolvedLabel(events, "resolve-channel")).toBe(
        `AXM stable channel — ${TARGET_VERSION}`,
      );

      // The unit that stays on screen for the whole delegation names both
      // facts, so they are readable while the mutation runs.
      const mutationLabel = unitStartLabel(events, "upgrade");
      expect(mutationLabel).toBe(`AXM ${TARGET_VERSION} via Homebrew`);

      const disclosed = indexOfEvent(
        events,
        (event) => event._tag === "UnitStarted" && event.unitId === "upgrade",
      );
      const firstMutation = indexOfEvent(
        events,
        (event) => event._tag === "UnitStarted" && event.label === "brew upgrade agentxm/tap/axm",
      );
      expect(disclosed).toBeGreaterThan(-1);
      expect(firstMutation).toBeGreaterThan(disclosed);
    }),
  );

  it.effect(
    "a preview discloses the method, the change, and the command, and mutates nothing",
    () =>
      Effect.gen(function* () {
        const { calls, document, events } = yield* runUpgrade({ preview: true });

        expect(unitResolvedLabel(events, "detect-install-method")).toBe(
          "AXM installed with Homebrew",
        );
        expect(
          events.some((event) => event._tag === "UnitStarted" && event.unitId === "upgrade"),
        ).toBe(false);

        expect(calls).toEqual([]);

        expect(document).toMatchObject({
          ok: true,
          result: {
            outcome: "previewed",
            disposition: "previewed",
            ownership: { method: "homebrew" },
            local: { version: LOCAL_VERSION },
            target: { version: TARGET_VERSION },
            mutation: { state: "not-attempted" },
            verification: { state: "not-attempted", reportedVersion: null },
            commands: [],
            details: { messages: ["Would run brew upgrade agentxm/tap/axm"] },
          },
        });
      }),
  );
});
