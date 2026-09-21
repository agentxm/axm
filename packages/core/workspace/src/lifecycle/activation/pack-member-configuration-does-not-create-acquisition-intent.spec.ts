import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import { DesiredStateReader } from "../../desired-state/index.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "../install/test-helpers.js";
import { applyUninstall, uninstallRequest } from "../uninstall/test-helpers.js";
import { applyUpdate, configuredUpdateRequest, expectResolved } from "../update/test-helpers.js";
import { applyActivation } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/pack-member-configuration-does-not-create-acquisition-intent",
  title: "Configuring a Pack-supplied member declares no acquisition",
  statement:
    "A settings entry that declares no source shall configure the member an installed Pack supplies under that local name: it shall record only the preferences it states, contribute no dependency root, version constraint, source resolution, or retention claim, and leave the Pack free to advance that member's version; changing activation for a member no direct entry declares shall write such an entry rather than copy the member's source or range, while an entry that does declare a source shall keep its constraint and the refusal that constraint earns.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "extension-adoption", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/activation-follows-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Whether a Pack transition that replaces a member identity under the same local name should refuse to carry the preference across, or move it; the current implementation keeps the preference bound to the local name.",
  ],
});

const RULE = "review";
const PACK = "reviews";
const RULE_FQN = `@acme/rules/${RULE}`;

/** The Registry a decisive example publishes into: one member, two Pack majors. */
const publishTwoPackMajors = (registry: InstallWorld["registry"]): void => {
  registry.writeRule(RULE, [
    { version: "1.0.0", body: "First guidance." },
    { version: "2.0.0", body: "Second guidance." },
  ]);
  registry.writePack(PACK, [
    { version: "1.0.0", dependencies: { [RULE_FQN]: "^1.0.0" } },
    { version: "2.0.0", dependencies: { [RULE_FQN]: "^2.0.0" } },
  ]);
};

/** Only the first Pack major exists yet, so an install settles on it. */
const publishFirstPackMajor = (registry: InstallWorld["registry"]): void => {
  registry.writeRule(RULE, [{ version: "1.0.0", body: "First guidance." }]);
  registry.writePack(PACK, [{ version: "1.0.0", dependencies: { [RULE_FQN]: "^1.0.0" } }]);
};

const ruleEntry = (workspace: InstallWorld["workspace"]): unknown => {
  const rules = readSettings(workspace)["rules"];
  return typeof rules === "object" && rules !== null
    ? (rules as Record<string, unknown>)[RULE]
    : undefined;
};

describe("Pack-member configuration does not create acquisition intent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("an activation preference never copies the member's source or range", () => {
    const { workspace, registry } = world();
    publishFirstPackMajor(registry);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: `@acme/packs/${PACK}` },
            }),
          );

          yield* applyActivation({ type: "rule", name: RULE, enabled: false });
          expect(ruleEntry(workspace)).toEqual({ enabled: false });

          yield* applyActivation({ type: "rule", name: RULE, enabled: true });
          expect(ruleEntry(workspace)).toEqual({ enabled: true });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a Pack advances its member across a prior activation preference", () => {
    const { workspace, registry } = world();
    publishFirstPackMajor(registry);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: `@acme/packs/${PACK}` },
            }),
          );
          yield* applyActivation({ type: "rule", name: RULE, enabled: false });
          yield* applyActivation({ type: "rule", name: RULE, enabled: true });

          // The newer Pack requires a member major the workspace never asked
          // for. Nothing in settings constrains it, so the update is free.
          publishTwoPackMajors(registry);
          const resolution = expectResolved(
            yield* applyUpdate(configuredUpdateRequest({ type: "pack" })),
          );

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          const accepted = workspace.readFile("axm-lock.yaml");
          expect(accepted).toContain("version: 2.0.0");
          // The preference survives the member's advance and still decides it.
          expect(ruleEntry(workspace)).toEqual({ enabled: true });
          const graph = yield* (yield* DesiredStateReader).graph();
          const node = graph.nodes.find(
            (candidate) => candidate.type === "rule" && candidate.name === RULE,
          );
          expect(node?.enabled).toBe(true);
          expect(node?.origins.some((origin) => origin.type === "settings")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a declared member constraint still refuses an incompatible Pack", () => {
    const { workspace, registry } = world();
    publishFirstPackMajor(registry);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: `@acme/packs/${PACK}` },
            }),
          );
          // A person declares the member directly, on their own terms. That is
          // acquisition intent, and it keeps the constraint it spells.
          yield* applyInstall(
            installRequest({
              type: "rule",
              subject: { kind: "source", source: `${RULE_FQN}@^1.0.0` },
            }),
          );
          const acceptedBefore = workspace.readFile("axm-lock.yaml");

          publishTwoPackMajors(registry);
          const resolution = expectResolved(
            yield* applyUpdate(configuredUpdateRequest({ type: "pack" })),
          );

          expect(deriveOperationOutcome(resolution)).not.toBe("applied");
          expect(workspace.readFile("axm-lock.yaml")).toBe(acceptedBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("removing the preference restores the inherited member activation", () => {
    const { workspace, registry } = world();
    publishFirstPackMajor(registry);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: `@acme/packs/${PACK}` },
            }),
          );
          yield* applyActivation({ type: "rule", name: RULE, enabled: false });
          const disabled = yield* (yield* DesiredStateReader).graph();
          expect(
            disabled.nodes.find((node) => node.type === "rule" && node.name === RULE)?.enabled,
          ).toBe(false);

          const settings = readSettings(workspace);
          workspace.writeFile(
            "axm.json",
            `${JSON.stringify({ ...settings, rules: {} }, null, 2)}\n`,
          );

          const restored = yield* (yield* DesiredStateReader).graph();
          expect(
            restored.nodes.find((node) => node.type === "rule" && node.name === RULE)?.enabled,
          ).toBe(true);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("removing the last owning Pack removes the configuration it orphans", () => {
    const { workspace, registry } = world();
    publishFirstPackMajor(registry);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: `@acme/packs/${PACK}` },
            }),
          );
          yield* applyActivation({ type: "rule", name: RULE, enabled: false });
          expect(ruleEntry(workspace)).toEqual({ enabled: false });

          const removal = yield* applyUninstall(uninstallRequest({ type: "pack", selector: PACK }));

          expect(deriveOperationOutcome(removal)).toBe("applied");
          // The preference has nothing left to configure, so it goes in the
          // same transition rather than lingering as an unbound entry.
          expect(ruleEntry(workspace)).toBeUndefined();
          const graph = yield* (yield* DesiredStateReader).graph();
          expect(graph.complete).toBe(true);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a configuration entry another Pack still supplies survives a removal", () => {
    const { workspace, registry } = world();
    registry.writeRule(RULE, [{ version: "1.0.0", body: "First guidance." }]);
    registry.writePack(PACK, [{ version: "1.0.0", dependencies: { [RULE_FQN]: "^1.0.0" } }]);
    registry.writePack("mirror", [{ version: "1.0.0", dependencies: { [RULE_FQN]: "^1.0.0" } }]);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: `@acme/packs/${PACK}` },
            }),
          );
          yield* applyInstall(
            installRequest({
              type: "pack",
              subject: { kind: "source", source: "@acme/packs/mirror" },
            }),
          );
          yield* applyActivation({ type: "rule", name: RULE, enabled: false });

          yield* applyUninstall(uninstallRequest({ type: "pack", selector: PACK }));

          // The member is still supplied, so the preference still has a
          // subject and still decides its activation.
          expect(ruleEntry(workspace)).toEqual({ enabled: false });
          const graph = yield* (yield* DesiredStateReader).graph();
          expect(
            graph.nodes.find((node) => node.type === "rule" && node.name === RULE)?.enabled,
          ).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a configuration entry no configured Pack supplies is reported", () => {
    const { workspace, registry } = world();
    publishFirstPackMajor(registry);
    return workspace
      .provide(
        Effect.gen(function* () {
          const settings = readSettings(workspace);
          workspace.writeFile(
            "axm.json",
            `${JSON.stringify({ ...settings, rules: { orphan: { enabled: false } } }, null, 2)}\n`,
          );

          const graph = yield* (yield* DesiredStateReader).graph();

          expect(graph.complete).toBe(false);
          expect(
            graph.problems.some(
              (problem) =>
                problem.type === "member-configuration-unbound" && problem.name === "orphan",
            ),
          ).toBe(true);
          expect(graph.nodes.some((node) => node.type === "rule" && node.name === "orphan")).toBe(
            false,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
