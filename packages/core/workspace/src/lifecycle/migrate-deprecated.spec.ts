import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome, previewPlanExecution } from "../transitions/planning/index.js";
import { preapprovedPlanExecution } from "../transitions/planning/testing.js";
import { ExtensionLifecycleFailed } from "./errors.js";
import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
} from "./install/test-helpers.js";
import type { InstallWorld } from "./install/test-helpers.js";
import { MigrateDeprecated } from "./migrate-deprecated.js";

export const specification = defineSpecification({
  requirement: "cli/migrate/acts-on-deprecation",
  title: "Migrate replaces or removes a deprecated installed extension",
  statement:
    "A migration of an installed Registry extension shall preview without changes, replace a superseded source with an available same-type or cross-type successor as one plan, remove an obsolete source, and refuse a manual-choice reason, concealed successor, or Pack-owned member.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SOURCE = "@acme/skills/old";
const NEXT_SKILL = "@acme/skills/new";
const NEXT_RULE = "@acme/rules/new";

const deprecate = (world: InstallWorld, value: Readonly<Record<string, unknown>>): void => {
  const index = path.join(
    world.registry.root,
    "extensions",
    "@acme",
    "skills",
    "old",
    "index.json",
  );
  const previous = fs.readFileSync(index, "utf8");
  expect(previous).toContain('"deprecation": null');
  fs.writeFileSync(
    index,
    previous.replace(
      '"deprecation": null',
      `"deprecation": ${JSON.stringify({
        deprecatedAt: "2026-03-01T00:00:00.000Z",
        ...value,
      })}`,
    ),
  );
};

describe("Migrate deprecated extension", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = () => {
    const created = makeInstallWorld({ settings: { agents: ["claude-code", "codex"] } });
    cleanups.push(created.cleanup);
    created.registry.writeSkill("old", [{ version: "1.0.0", body: "Old guidance" }]);
    return created;
  };

  const installSource = (created: InstallWorld) =>
    created.workspace
      .provide(
        applyInstall(
          installRequest({
            type: "skill",
            subject: { kind: "source", source: SOURCE },
          }),
        ),
      )
      .pipe(Effect.provide(NodeServices.layer));

  it.effect.each([
    ["same-type", NEXT_SKILL],
    ["cross-type", NEXT_RULE],
  ] as const)(
    "replaces a superseded extension with a $0 successor in one plan",
    ([, replacement]) => {
      const created = world();
      if (replacement === NEXT_SKILL) {
        created.registry.writeSkill("new", [{ version: "1.0.0", body: "New guidance" }]);
      } else {
        created.registry.writeRule("new", [{ version: "1.0.0", body: "New rule" }]);
      }
      return created.workspace
        .provide(
          Effect.gen(function* () {
            yield* installSource(created);
            deprecate(created, {
              reason: "superseded",
              replacement: { status: "available", fqn: replacement },
            });
            const candidate = yield* MigrateDeprecated.prepare(SOURCE);
            const before = created.workspace.snapshot();
            const preview = yield* MigrateDeprecated.previewOrApply(
              candidate,
              previewPlanExecution,
            );
            expect(deriveOperationOutcome(preview)).toBe("previewed");
            expect(created.workspace.snapshot()).toEqual(before);
            const applied = yield* MigrateDeprecated.previewOrApply(
              candidate,
              preapprovedPlanExecution,
            );
            expect(deriveOperationOutcome(applied)).toBe("applied");
            const settings = readSettings(created.workspace);
            expect(JSON.stringify(settings)).not.toContain(SOURCE);
            expect(JSON.stringify(settings)).toContain(replacement);
            expect(settings["agents"]).toEqual(["claude-code", "codex"]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("removes an obsolete extension", () => {
    const created = world();
    return created.workspace
      .provide(
        Effect.gen(function* () {
          yield* installSource(created);
          deprecate(created, { reason: "obsolete", message: "No longer needed." });
          const candidate = yield* MigrateDeprecated.prepare(SOURCE);
          const applied = yield* MigrateDeprecated.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );
          expect(deriveOperationOutcome(applied)).toBe("applied");
          expect(JSON.stringify(readSettings(created.workspace))).not.toContain(SOURCE);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each([
    ["unmaintained", { reason: "unmaintained" }],
    ["other", { reason: "other", message: "Choose manually" }],
    ["concealed", { reason: "superseded", replacement: { status: "unavailable" } }],
  ] as const)("refuses $0 without changing the workspace", ([, deprecation]) => {
    const created = world();
    return created.workspace
      .provide(
        Effect.gen(function* () {
          yield* installSource(created);
          deprecate(created, deprecation);
          const before = created.workspace.snapshot();
          const failure = yield* MigrateDeprecated.prepare(SOURCE).pipe(Effect.flip);
          expect(String(failure)).toBeTruthy();
          expect(created.workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "refuses a Pack-owned member and directs the publisher to update the dependency",
    () => {
      const created = world();
      created.registry.writePack("bundle", [
        {
          version: "1.0.0",
          dependencies: { [SOURCE]: "^1.0.0" },
        },
      ]);
      return created.workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({
                type: "pack",
                subject: { kind: "source", source: "@acme/packs/bundle" },
              }),
            );
            deprecate(created, { reason: "obsolete", message: "Remove from the Pack." });
            const before = created.workspace.snapshot();
            const failure = yield* MigrateDeprecated.prepare(SOURCE).pipe(Effect.flip);
            expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
            if (failure instanceof ExtensionLifecycleFailed) {
              expect(failure.detail).toContain("pack publisher");
            }
            expect(created.workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
