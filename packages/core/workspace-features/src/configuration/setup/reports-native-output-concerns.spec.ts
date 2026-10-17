import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { makeSetupFixture } from "../testing.js";
import { runSetup } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/setup/reports-native-output-concerns",
  title: "Setup discloses relevant native leftovers before approval and preserves user links",
  statement:
    "Setup shall report broken native links and same-name user collisions relevant to its proposed outputs before approval using lint's classifications, re-observe on apply, and preserve unowned links and their targets.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Production setup observes real temporary project and user directories before and after preview and apply; the bundled skill install remains the application's separate boundary.",
  methods: ["example"],
  derivedFrom: ["cli/lint/reports-broken-native-output-links"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("setup native-output preflight", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect(
    "does not ask for separate cleanup of the source link the bundled installation will restore",
    () => {
      const fixture = makeSetupFixture();
      cleanups.push(fixture.cleanup);
      const link = path.join(fixture.root, ".claude/skills/axm");
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(
        path.join(fixture.root, "agent_extensions/registry.agentxm.ai/@agentxm/skills/axm/src"),
        link,
      );
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();
            const preview = yield* runSetup({
              scope: "project",
              scopeExplicit: true,
              nonInteractive: true,
              preview: true,
              projectRoot: decodeAbsolutePathSync(fixture.root),
              agents: ["claude-code"],
              telemetryEnabled: false,
            });
            expect(
              preview.outcome.steps.filter((step) => step.nativeOutputIssue === "broken-link"),
            ).toEqual([]);
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "previews two leftovers without writes and re-observes their changed state before apply",
    () => {
      const fixture = makeSetupFixture();
      cleanups.push(fixture.cleanup);
      const target = path.join(fixture.home, "missing-target");
      const links = [".claude/skills/axm", ".agents/skills/axm"].map((relative) =>
        path.join(fixture.home, relative),
      );
      for (const link of links) {
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(target, link);
      }
      const request = {
        scope: "project" as const,
        scopeExplicit: true,
        nonInteractive: false,
        projectRoot: decodeAbsolutePathSync(fixture.root),
        agents: ["claude-code", "codex"],
        telemetryEnabled: false,
      };
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = [fixture.snapshot(), fixture.homeSnapshot()];
            const preview = yield* runSetup({ ...request, preview: true });
            expect(
              preview.outcome.steps.filter((step) => step.nativeOutputIssue === "broken-link"),
            ).toHaveLength(2);
            expect(
              preview.outcome.steps.filter((step) => step.nativeOutputIssue === "collision"),
            ).toEqual([]);
            expect(
              fixture
                .promptState()
                .presentSetupPlanCalls[0]?.filter((row) => row.action === "warning"),
            ).toHaveLength(2);
            expect([fixture.snapshot(), fixture.homeSnapshot()]).toEqual(before);
            fs.mkdirSync(target);
            const homeBeforeApply = fixture.homeSnapshot();
            const applied = yield* runSetup({ ...request, yes: true });
            expect(
              applied.outcome.steps.filter((step) => step.nativeOutputIssue === "broken-link"),
            ).toEqual([]);
            expect(
              applied.outcome.steps.some((step) => step.nativeOutputIssue === "collision"),
            ).toBe(true);
            expect(fixture.homeSnapshot()).toEqual(homeBeforeApply);
            for (const link of links) expect(fs.readlinkSync(link)).toBe(target);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
