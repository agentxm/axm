import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import * as NodeServices from "@effect/platform-node/NodeServices";

import {
  TARGET_VERSION,
  indexOfEvent,
  runUpgradeTrial,
  unitResolvedLabel,
  unitStartLabel,
} from "../testing.js";

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
      const { events } = yield* runUpgradeTrial();

      // The units that resolve a fact settle carrying that fact. The exact
      // sentence is wording; that the owner and the target are named is the
      // disclosure.
      expect(unitResolvedLabel(events, "detect-install-method")).toContain("Homebrew");
      expect(unitResolvedLabel(events, "resolve-channel")).toContain(TARGET_VERSION);

      // The unit that stays on screen for the whole delegation names both
      // facts, so they are readable while the mutation runs.
      const mutationLabel = unitStartLabel(events, "upgrade");
      expect(mutationLabel).toContain(TARGET_VERSION);
      expect(mutationLabel).toContain("Homebrew");

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
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("a preview discloses the resolved owner and starts no mutation unit", () =>
    Effect.gen(function* () {
      const { assessment, events } = yield* runUpgradeTrial({ preview: true });

      expect(unitResolvedLabel(events, "detect-install-method")).toContain("Homebrew");
      expect(unitResolvedLabel(events, "resolve-channel")).toContain(TARGET_VERSION);
      expect(
        events.some((event) => event._tag === "UnitStarted" && event.unitId === "upgrade"),
      ).toBe(false);
      expect(assessment).toMatchObject({
        ownership: { method: "homebrew" },
        target: { version: TARGET_VERSION },
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
