import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { applyInstall, installRequest, makeInstallWorld } from "../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/extensions/install/refuses-overlapping-package-addresses",
  title: "Retained package source addresses preserve exclusive ownership",
  statement:
    "Before an install changes workspace state, AXM shall refuse distinct retained packages whose source-address paths coincide or overlap on supported filesystems, including case-insensitive spelling, and shall refuse an existing destination or replacement scratch path without accepted ownership. Repeated selected components of the same retained package shall share its address.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["docs/architecture/extensions/source-compatible-distribution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

type Scenario =
  "case-collision" | "unowned-destination" | "unowned-link" | "unowned-staging" | "unowned-backup";

/**
 * Whether names that differ only by case are one entry where tests write, as
 * on a default macOS volume. The case-collision scenario needs `Plugin` and
 * `plugin` side by side, which such a filesystem cannot hold.
 */
const foldsCase = (() => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-case-probe-"));
  try {
    fs.writeFileSync(path.join(directory, "Probe"), "");
    return fs.existsSync(path.join(directory, "probe"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
})();

describe("Retained package address admission", () => {
  const refuses = (scenario: Scenario) =>
    Effect.gen(function* () {
      const world = yield* Effect.acquireRelease(
        Effect.sync(() => makeInstallWorld()),
        (world) => Effect.sync(() => world.cleanup()),
      );
      const source = path.join(world.workspace.root, "vendor");
      const packages =
        scenario === "case-collision"
          ? [
              ["Plugin", "first"],
              ["plugin", "second"],
            ]
          : [["plugin", "first"]];
      for (const pair of packages) {
        const [directory, name] = pair;
        if (directory === undefined || name === undefined)
          throw new Error("Expected package coordinates");
        const root = path.join(source, directory);
        fs.mkdirSync(path.join(root, ".claude-plugin"), { recursive: true });
        fs.mkdirSync(path.join(root, "skills", name), { recursive: true });
        fs.writeFileSync(
          path.join(root, ".claude-plugin/plugin.json"),
          JSON.stringify({ name, skills: "./skills" }),
        );
        fs.writeFileSync(path.join(root, "skills", name, "SKILL.md"), `# ${name}\n`);
      }
      if (scenario !== "case-collision") {
        const destination = path.join(
          world.workspace.root,
          `agent_extensions/_local/project/vendor/plugin${scenario === "unowned-staging" ? ".axm-staging" : scenario === "unowned-backup" ? ".axm-backup" : ""}`,
        );
        if (scenario === "unowned-link") {
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.symlinkSync("missing-package", destination);
        } else {
          fs.mkdirSync(destination, { recursive: true });
          fs.writeFileSync(path.join(destination, "keep.txt"), "Unowned content\n");
        }
      }
      const before = world.workspace.snapshot();
      const result = yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              all: true,
            }),
          ),
        )
        .pipe(Effect.result);
      if (scenario === "unowned-link") {
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure).toMatchObject({ cause: { reason: "dangling-ancestor" } });
      } else {
        expect(Result.isSuccess(result)).toBe(true);
        if (Result.isSuccess(result))
          expect(result.success).toMatchObject({
            blocking: {
              detail: expect.stringContaining(
                scenario === "case-collision" ? "overlap" : "without accepted ownership",
              ),
            },
          });
      }
      expect(world.workspace.snapshot()).toEqual(before);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

  it.effect.skipIf(foldsCase)("refuses case-collision before workspace mutation", () =>
    refuses("case-collision"),
  );

  it.effect.each([
    "unowned-destination",
    "unowned-link",
    "unowned-staging",
    "unowned-backup",
  ] as const)("refuses %s before workspace mutation", refuses);
});
