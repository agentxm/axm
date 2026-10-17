import { snapshotTree } from "@agentxm/test-support";
import { defineSpecification } from "@agentxm/specification-metadata";
import { WorkspaceInitializationInteraction } from "@agentxm/workspace-features/configuration";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach } from "vitest";
import { TestRenderer } from "../../test-support/presenter-test.js";
import { makeSetupSpecContext } from "../../test-support/setup-harness.js";
import { WorkspaceInitializationInteractionLive } from "../../workspace-initialization-interaction-live.js";
import { handleSetup } from "../setup.js";

export const specification = defineSpecification({
  requirement: "cli/setup/discloses-effective-telemetry",
  title: "Setup discloses effective telemetry before changes",
  statement:
    "Human setup previews and final interactive confirmation shall disclose effective all, errors-only, or off telemetry before applying workspace changes, following existing environment precedence without persisting a separate consent setting.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "The application preview runs against a real temporary workspace and the production confirmation adapter exposes its disclosure through the screen question seam.",
  methods: ["example"],
  derivedFrom: ["system/security/telemetry-consent-and-precedence"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const cases = [
  {
    environment: { AXM_TELEMETRY: "1", DO_NOT_TRACK: "", DISABLE_TELEMETRY: "" },
    notice: "Telemetry: all.",
  },
  {
    environment: { AXM_TELEMETRY: "errors", DO_NOT_TRACK: "", DISABLE_TELEMETRY: "" },
    notice: "Telemetry: errors only.",
  },
  {
    environment: { AXM_TELEMETRY: "off", DO_NOT_TRACK: "", DISABLE_TELEMETRY: "" },
    notice: "Telemetry: off.",
  },
  {
    environment: { AXM_TELEMETRY: "1", DO_NOT_TRACK: "1", DISABLE_TELEMETRY: "" },
    notice: "Telemetry: off.",
  },
];

describe("Early telemetry disclosure", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect.each(cases)("preview: $notice", ({ environment, notice }) => {
    const context = makeSetupSpecContext({ environment });
    cleanups.push(context.cleanup);
    const before = snapshotTree(context.root);
    return context.provide(
      Effect.gen(function* () {
        yield* handleSetup({ scope: "project", agents: ["claude-code"], preview: true });
        expect(JSON.stringify(context.rendererState.docs)).toContain(notice);
        expect(snapshotTree(context.root)).toEqual(before);
        expect(context.exists("axm.json")).toBe(false);
      }),
    );
  });
  it.effect.each(cases)("confirmation: $notice", ({ environment, notice }) => {
    const renderer = TestRenderer.make();
    const layer = WorkspaceInitializationInteractionLive.pipe(Layer.provide(renderer.layer));
    return Effect.gen(function* () {
      const interaction = yield* WorkspaceInitializationInteraction;
      yield* interaction.confirmSetupPlan();
      expect(renderer.state.script.asks[0]?.note).toContain(notice);
    }).pipe(
      Effect.provide(
        Layer.merge(layer, ConfigProvider.layer(ConfigProvider.fromEnvRecord(environment))),
      ),
    );
  });
});
