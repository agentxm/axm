import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as fs from "node:fs";
import * as path from "node:path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { captureCopiedDirectory } from "@agentxm/workspace-kernel/locations";
import { ConfiguredAgentOutcomesProviderLive } from "@agentxm/workspace-kernel/reconciliation/live";
import { StepFailureConversionTest } from "@agentxm/workspace-kernel/reconciliation/testing";
import { LocalInspection } from "../index.js";
import { makeAuthoredExtensionFixture } from "../testing.js";
import { makeInstalledWorkspace } from "../test-support/installed-workspace.js";

const makeNativeFixture = (settings: Readonly<Record<string, unknown>>) => {
  const fixture = makeInstalledWorkspace();
  const writeFile = (relative: string, content: string) => {
    const target = path.join(fixture.root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  writeFile("axm.json", JSON.stringify({ agents: ["claude-code"], owner: "@acme", ...settings }));
  return {
    ...fixture,
    writeFile,
    readFile: (relative: string) => fs.readFileSync(path.join(fixture.root, relative), "utf8"),
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      fixture.provide(
        effect.pipe(
          Effect.provide(
            Layer.provideMerge(ConfiguredAgentOutcomesProviderLive, StepFailureConversionTest),
          ),
        ),
      ),
  };
};

export const specification = defineSpecification({
  requirement: "cli/show/bounds-path-ownership",
  title: "Path inspection keeps package boundaries and unowned content explicit",
  statement:
    "AXM shall resolve contained local paths only through established package or native ownership boundaries, preserve their lexical and resolved addresses, and report existing unowned content without assigning it an editable package owner.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "Production workspace queries inspect native paths and an escaping symlink in an isolated filesystem fixture.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
describe("Bounded path ownership", () => {
  it.effect(
    "retains an absent declared projection and observes alias retargeting on the next query",
    () => {
      const fixture = makeNativeFixture({ skills: { example: { source: "workspace" } } });
      fixture.writeFile(
        "skills/example/skill.json",
        JSON.stringify({
          type: "skill",
          name: "example",
          owner: "@acme",
          version: "1.0.0",
          description: "Source Skill",
        }),
      );
      fixture.writeFile(
        "skills/example/src/SKILL.md",
        "---\nname: example\ndescription: Source Skill\n---\n# Source Skill\n",
      );
      fixture.writeFile("unrelated/SKILL.md", fixture.readFile("skills/example/src/SKILL.md"));
      const native = `${fixture.root}/.claude/skills/example`;
      return fixture
        .provide(
          Effect.gen(function* () {
            const absent = yield* LocalInspection.query({
              selection: { kind: "paths", paths: [".claude/skills/example"] },
              types: ["skill"],
            });
            expect(absent.requests[0]?.code).toBe(0);
            expect(absent.items[0]).toMatchObject({
              identity: { name: "example" },
              editing: { kind: "authored-source" },
              observed: { state: "present" },
            });
            expect(absent.nativeLocations).toContainEqual(
              expect.objectContaining({
                address: { kind: "entry", path: native },
                ownership: "absent",
                state: "absent",
              }),
            );
            fs.mkdirSync(path.dirname(native), { recursive: true });
            fs.symlinkSync(`${fixture.root}/skills/example/src`, native);
            const owned = yield* LocalInspection.query({
              selection: { kind: "paths", paths: [".claude/skills/example/SKILL.md"] },
              types: ["skill"],
            });
            expect(owned.items[0]?.editing.kind).toBe("authored-source");
            expect(owned.requests[0]?.path?.referent).toBe(
              `${fixture.root}/skills/example/src/SKILL.md`,
            );
            fs.unlinkSync(native);
            fs.symlinkSync(`${fixture.root}/unrelated`, native);
            const changed = yield* LocalInspection.query({
              selection: { kind: "paths", paths: [".claude/skills/example/SKILL.md"] },
              types: ["skill"],
            });
            expect(changed.requests[0]).toMatchObject({
              code: 0,
              path: { referent: `${fixture.root}/unrelated/SKILL.md`, unownedRemainder: true },
            });
            expect(changed.items).toHaveLength(1);
            expect(changed.items[0]?.editing.kind).toBe("unmanaged");
            expect(fs.readlinkSync(native)).toBe(`${fixture.root}/unrelated`);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
  it.effect(
    "resolves separate instruction regions without claiming the shared file or foreign prose",
    () => {
      const fixture = makeNativeFixture({
        agents: ["codex"],
        instructionFiles: { fileName: "AGENTS.md" },
        rules: { review: { source: "workspace" } },
        knowledge: { guide: { source: "workspace" } },
      });
      fixture.writeFile(
        "rules/review/rule.json",
        JSON.stringify({
          type: "rule",
          name: "review",
          owner: "@acme",
          version: "1.0.0",
          title: "Review",
          description: "Review changes",
        }),
      );
      fixture.writeFile("rules/review/src/RULE.md", "Record review risks.\n");
      fixture.writeFile(
        "knowledge/guide/knowledge.json",
        JSON.stringify({
          type: "knowledge",
          name: "guide",
          owner: "@acme",
          version: "1.0.0",
          description: "Guide",
          format: { name: "okf", version: "0.2" },
          bundleRoot: "src",
        }),
      );
      fixture.writeFile("knowledge/guide/src/index.md", '---\nokf_version: "0.2"\n---\n# Guide\n');
      const instructions =
        "# Foreign instructions\nKeep this prose.\n\n<!-- axm:rules -->\nRecord review risks.\n<!-- /axm:rules -->\n\n<!-- axm:knowledge -->\nGuide discovery.\n<!-- /axm:knowledge -->\n";
      fixture.writeFile("AGENTS.md", instructions);
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* LocalInspection.query({
              selection: { kind: "paths", paths: ["AGENTS.md"] },
            });
            expect(result.requests[0]).toMatchObject({ code: 0, path: { unownedRemainder: true } });
            expect(
              result.items.map((item) => [item.identity.type, item.identity.name]).sort(),
            ).toEqual([
              ["knowledge", "guide"],
              ["rule", "review"],
            ]);
            for (const item of result.items) {
              expect(item.editing.address?.path).toBe(
                `${fixture.root}/${item.identity.type === "rule" ? "rules/review" : "knowledge/guide"}`,
              );
              const units = result.nativeLocations.filter((unit) =>
                item.nativeLocationRefs.includes(unit.id),
              );
              expect(units).toContainEqual(
                expect.objectContaining({
                  address: {
                    kind: "region",
                    path: `${fixture.root}/AGENTS.md`,
                    region: item.identity.type === "rule" ? "rules" : "knowledge",
                  },
                }),
              );
              expect(units.some((unit) => unit.address.kind === "file")).toBe(false);
            }
            expect(fixture.readFile("AGENTS.md")).toBe(instructions);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
  it.effect(
    "maps receipt-owned copy children but leaves foreign additions and unrelated symlinks unmanaged",
    () => {
      const fixture = makeNativeFixture({ skills: { example: { source: "workspace" } } });
      fixture.writeFile(
        "skills/example/skill.json",
        JSON.stringify({
          type: "skill",
          name: "example",
          owner: "@acme",
          version: "1.0.0",
          description: "Source Skill",
        }),
      );
      fixture.writeFile(
        "skills/example/src/SKILL.md",
        "---\nname: example\ndescription: Source Skill\n---\n# Source Skill\n",
      );
      const native = `${fixture.root}/.claude/skills/example`;
      fs.mkdirSync(`${fixture.root}/.claude/skills`, { recursive: true });
      fs.cpSync(`${fixture.root}/skills/example/src`, native, { recursive: true });
      fixture.writeFile("unrelated/SKILL.md", fixture.readFile("skills/example/src/SKILL.md"));
      fs.symlinkSync(`${fixture.root}/unrelated`, `${fixture.root}/.claude/skills/foreign`);
      return fixture
        .provide(
          Effect.gen(function* () {
            yield* captureCopiedDirectory(native, `${fixture.root}/skills/example/src`);
            fixture.writeFile(".claude/skills/example/foreign.txt", "foreign addition");
            const result = yield* LocalInspection.query({
              selection: {
                kind: "paths",
                paths: [
                  ".claude/skills/example/SKILL.md",
                  ".claude/skills/example/foreign.txt",
                  ".claude/skills/foreign/SKILL.md",
                ],
              },
              types: ["skill"],
            });
            expect(result.requests.map((request) => request.code)).toEqual([0, 0, 0]);
            expect(result.items[0]).toMatchObject({
              identity: { name: "example" },
              editing: { kind: "authored-source" },
            });
            expect(result.items.slice(1).every((item) => item.editing.kind === "unmanaged")).toBe(
              true,
            );
            expect(result.requests[0]?.path?.unownedRemainder).toBe(true);
            expect(fixture.readFile(".claude/skills/example/foreign.txt")).toBe("foreign addition");
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
  it.effect(
    "resolves shared configuration contributors once and preserves foreign remainder",
    () => {
      const connection = { transport: "stdio", command: "node", args: ["server.js"] };
      const fixture = makeNativeFixture({
        mcpServers: { work: { connection }, personal: { connection } },
      });
      fixture.writeFile(
        ".mcp.json",
        JSON.stringify({
          mcpServers: {
            work: { command: "node", args: ["server.js"] },
            personal: { command: "node", args: ["server.js"] },
            foreign: { command: "other" },
          },
          unrelated: true,
        }),
      );
      return fixture
        .provide(
          Effect.gen(function* () {
            const result = yield* LocalInspection.query({
              selection: { kind: "paths", paths: ["axm.json", ".mcp.json", "./.mcp.json"] },
              types: ["mcp-server"],
            });
            expect(result.requests.map((request) => request.code)).toEqual([0, 0, 0]);
            expect(result.items.map((item) => item.identity.name).sort()).toEqual([
              "personal",
              "work",
            ]);
            expect(result.requests.every((request) => request.path?.unownedRemainder)).toBe(true);
            expect(result.requests[1]?.subjectRefs).toEqual(result.requests[2]?.subjectRefs);
            for (const item of result.items) expect(item.requestRefs).toHaveLength(3);
            expect(result.items.every((item) => item.editing.kind === "inline-configuration")).toBe(
              true,
            );
            expect(fixture.readFile(".mcp.json")).toContain("foreign");
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
  it.effect("distinguishes authored contents, unowned content, and a missing path", () => {
    const fixture = makeAuthoredExtensionFixture("skill");
    fixture.writeFile("notes.txt", "unowned");
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: {
              kind: "paths",
              paths: ["skills/example/src/SKILL.md", "notes.txt", "missing.txt"],
            },
          });
          expect(result.requests.map((request) => request.code)).toEqual([0, 0, 3]);
          expect(result.items[0]?.editing.kind).toBe("authored-source");
          expect(result.items[1]?.editing.kind).toBe("unmanaged");
          expect(result.requests[0]?.path).toMatchObject({
            lexical: "skills/example/src/SKILL.md",
            entry: `${fixture.root}/skills/example/src/SKILL.md`,
          });
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
  it.effect("does not assign an outside referent to the package containing its symlink", () => {
    const fixture = makeAuthoredExtensionFixture("skill");
    fixture.writeFile("foreign.txt", "outside authored package");
    fs.symlinkSync(`${fixture.root}/foreign.txt`, `${fixture.root}/skills/example/src/foreign.txt`);
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "paths", paths: ["skills/example/src/foreign.txt"] },
            types: ["skill"],
          });
          expect(result.items[0]?.editing.kind).toBe("unmanaged");
          expect(result.requests[0]?.path?.referent).toBe(`${fixture.root}/foreign.txt`);
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
  it.effect("reports an existing dangling unmanaged entry without inventing its referent", () => {
    const fixture = makeAuthoredExtensionFixture("skill");
    fs.symlinkSync("missing-target", `${fixture.root}/dangling`);
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* LocalInspection.query({
            selection: { kind: "paths", paths: ["dangling"] },
          });
          expect(result.requests[0]).toMatchObject({
            code: 0,
            path: {
              lexical: "dangling",
              entry: `${fixture.root}/dangling`,
              unownedRemainder: true,
            },
          });
          expect(result.requests[0]?.path?.referent).toBeUndefined();
          expect(result.items[0]).toMatchObject({
            editing: { kind: "unmanaged" },
            observed: { state: "present" },
          });
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
