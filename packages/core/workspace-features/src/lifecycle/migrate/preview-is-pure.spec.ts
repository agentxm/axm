import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { applyInstall, installRequest, makeInstallWorld } from "../../testing/install-world.js";
import { MigrateDeprecated } from "../migrate-deprecated.js";

export const specification = defineSpecification({
  requirement: "cli/migrate/preview-is-pure",
  title: "Migration preview preserves the workspace",
  statement:
    "Previewing an obsolete or superseded installed extension shall report the migration plan without changing desired settings, accepted resolution, retained packages, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Migration preview", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(["obsolete", "superseded"] as const)(
    "preserves the complete workspace for %s",
    (reason) => {
      const world = makeInstallWorld({ settings: { agents: ["claude-code", "codex"] } });
      cleanups.push(world.cleanup);
      world.registry.writeSkill("old", [{ version: "1.0.0", body: "Old guidance" }]);
      world.registry.writeSkill("new", [{ version: "1.0.0", body: "New guidance" }]);
      const source = "@acme/skills/old";
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({ type: "skill", subject: { kind: "source", source } }),
            );
            const index = path.join(
              world.registry.root,
              "extensions",
              "@acme",
              "skills",
              "old",
              "index.json",
            );
            const metadata = fs.readFileSync(index, "utf8");
            expect(metadata).toContain('"deprecation": null');
            fs.writeFileSync(
              index,
              metadata.replace(
                '"deprecation": null',
                `"deprecation": ${JSON.stringify({
                  deprecatedAt: "2026-03-01T00:00:00.000Z",
                  reason,
                  message: "Retired guidance",
                  ...(reason === "superseded"
                    ? { replacement: { status: "available", fqn: "@acme/skills/new" } }
                    : {}),
                })}`,
              ),
            );
            const before = world.workspace.snapshot();
            const candidate = yield* MigrateDeprecated.prepare(source);
            const result = yield* MigrateDeprecated.previewOrApply(candidate, previewPlanExecution);
            expect(deriveOperationOutcome(result)).toBe("previewed");
            expect(world.workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
