import { absoluteLocalFixturePath } from "../../test-support/retained-paths.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { snapshotTree } from "@agentxm/test-support";
import { runCli } from "../../utils.js";
import { makeDirectoryFixture } from "../../test-support/directory-harness.js";

const write = (target: string, content: string) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

it.effect(
  "preserves native identity, read-only rendering, and mixed support across processes",
  () =>
    Effect.gen(function* () {
      const fixture = makeDirectoryFixture();
      try {
        write(
          path.join(fixture.selected, "axm.json"),
          JSON.stringify({
            owner: "@acme",
            agents: ["claude-code", "codex"],
          }),
        );
        const native =
          "---\nname: investigator\ndescription: Inspect supplied evidence\ntools: Read, Grep\n---\n\nPreserve this native body.\n".replaceAll(
            "\n",
            "\r\n",
          );
        const source = path.join(fixture.selected, "input", "agent.md");
        write(source, native);
        const run = (args: ReadonlyArray<string>, expected = 0) =>
          Effect.promise(async () => {
            const result = await runCli(
              ["-C", fixture.selected, ...args, "--json", "--non-interactive"],
              {
                cwd: fixture.invoking,
                env: {
                  HOME: fixture.home,
                  USERPROFILE: fixture.home,
                  AXM_USER_HOME: fixture.home,
                  AXM_NO_UPDATE_CHECK: "1",
                  BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
                },
              },
            );
            expect(result.exitCode, `${args.join(" ")}\n${result.stdout}${result.stderr}`).toBe(
              expected,
            );
            return result.stdout;
          });
        const before = snapshotTree(fixture.selected);
        const importArgs = [
          "subagents",
          "import",
          source,
          "@acme/subagents/reviewer",
          "--source-agent",
          "claude-code",
          "--enable",
        ];
        yield* run([...importArgs, "--preview"]);
        expect(snapshotTree(fixture.selected)).toEqual(before);
        const imported = yield* run(importArgs);
        expect(imported).toContain("unsupported");
        const projected = path.join(fixture.selected, ".claude", "agents", "investigator.md");
        expect(fs.readFileSync(projected, "utf8")).toContain("Preserve this native body.");
        expect(fs.readFileSync(source, "utf8")).toBe(native);
        expect(
          fs.existsSync(path.join(fixture.selected, ".codex", "agents", "reviewer.toml")),
        ).toBe(false);
        const accepted = snapshotTree(fixture.selected);
        const rendered = yield* run(["subagents", "show", "reviewer", "--render", "claude-code"]);
        expect(rendered).toContain('"nativeName": "investigator"');
        expect(rendered).toContain('"mode": "native"');
        yield* run(["subagents", "show", "reviewer", "--render", "codex"], 1);
        yield* run(["subagents", "show", "reviewer", "--render", "unknown-runtime"], 2);
        expect(snapshotTree(fixture.selected)).toEqual(accepted);
        yield* run(["sync"]);
        expect(snapshotTree(fixture.selected)).toEqual(accepted);
        yield* run(["subagents", "disable", "reviewer"]);
        expect(fs.existsSync(projected)).toBe(false);
        yield* run(["subagents", "enable", "reviewer"]);
        expect(fs.readFileSync(projected, "utf8")).toContain("Preserve this native body.");
        yield* run(["subagents", "uninstall", "reviewer"]);
        expect(fs.existsSync(projected)).toBe(false);
        expect(fs.readFileSync(source, "utf8")).toBe(native);
      } finally {
        fixture.cleanup();
      }
    }),
);

for (const scope of ["project", "user"] as const)
  it.effect(`acquires a complete native-only package from a path in ${scope} scope`, () =>
    Effect.gen(function* () {
      const fixture = makeDirectoryFixture();
      try {
        const workspace =
          scope === "project" ? fixture.selected : path.join(fixture.home, ".axm", "workspace");
        write(
          path.join(workspace, "axm.json"),
          JSON.stringify({ owner: "@acme", agents: ["codex"] }),
        );
        const source = path.join(fixture.invoking, "package~fixture");
        const native =
          'name = "investigator"\ndescription = "Review"\nsandbox_mode = "read-only"\ndeveloper_instructions = "Review evidence"\n';
        write(
          path.join(source, "subagent.json"),
          JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "reviewer",
            version: "1.0.0",
            implementations: { codex: { kind: "native", source: "native/review.toml" } },
          }),
        );
        write(path.join(source, "native", "review.toml"), native);
        write(path.join(source, "LICENSE"), "Fixture license.\n");
        const execute = (args: ReadonlyArray<string>) =>
          Effect.promise(async () => {
            const result = await runCli(
              ["-C", fixture.selected, ...args, "--scope", scope, "--json", "--non-interactive"],
              {
                cwd: fixture.invoking,
                env: {
                  HOME: fixture.home,
                  USERPROFILE: fixture.home,
                  AXM_USER_HOME: fixture.home,
                  AXM_NO_UPDATE_CHECK: "1",
                  BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
                },
              },
            );
            expect(result.exitCode, `${args.join(" ")}\n${result.stdout}${result.stderr}`).toBe(0);
            return result.stdout;
          });
        const before = snapshotTree(source);
        yield* execute(["install", source, "--subagent", "reviewer"]);
        const canonical = path.join(workspace, absoluteLocalFixturePath(source));
        expect(fs.readFileSync(path.join(canonical, "native", "review.toml"), "utf8")).toBe(native);
        expect(fs.readFileSync(path.join(canonical, "LICENSE"), "utf8")).toBe("Fixture license.\n");
        const nativeRoot = scope === "project" ? fixture.selected : fixture.home;
        expect(
          fs.readFileSync(path.join(nativeRoot, ".codex", "agents", "investigator.toml"), "utf8"),
        ).toContain(native);
        yield* execute(["subagents", "uninstall", "reviewer"]);
        expect(fs.existsSync(canonical)).toBe(false);
        expect(snapshotTree(source)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    }),
  );
