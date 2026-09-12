import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applyInstall,
  contentUnder,
  installRequest,
  localLifecycleRows,
  makeInstallWorld,
} from "../install/test-helpers.js";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import {
  makeLifecycleFixture,
  writeAgentSkillDirectory,
  type LifecycleFixture,
} from "../testing.js";
import { applyActivation, workspaceWithAuthoredExtension } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/activation-follows-desired-state",
  title: "Activation preserves leaf content and realizes Pack dependency routes",
  statement:
    "When a desired leaf extension is disabled or enabled, including one reached only through a Pack, AXM shall record a direct activation preference that takes precedence over inherited activation, realize its resulting agent surfaces, and preserve its canonical content and accepted resolution; Pack activation shall preserve the Pack itself while realizing or withdrawing its dependency route, retiring exclusively unreachable acquired members, and retaining members reached elsewhere; re-enabling a Skill shall restore its entry document byte for byte for every agent surface, whichever entry-document format the Skill was authored in.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Activation follows desired state", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const track = (fixture: LifecycleFixture): LifecycleFixture => {
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect.each(localLifecycleRows)(
    "re-enables local $type from accepted content after upstream changes",
    (row) => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const { workspace } = world;
      const name = "review";
      const source = row.writePackage(workspace.root, { name });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({ type: row.type, subject: { kind: "source", source } }),
            );
            yield* applyActivation({ type: row.type, name, enabled: false });
            const accepted = workspace.readFile("axm-lock.yaml");
            const canonical = `agent_extensions/local/vendor/${name}/${row.canonicalFile(name)}`;
            const content = workspace.readFile(canonical);
            workspace.writeFile(
              `vendor/${name}/${row.canonicalFile(name)}`,
              `${content}\nUpstream changed.\n`,
            );
            const enabled = yield* applyActivation({ type: row.type, name, enabled: true });
            expect(enabled._tag === "Resolved" ? enabled.outcome : enabled._tag).toBe("applied");
            expect(workspace.readFile("axm-lock.yaml")).toBe(accepted);
            expect(workspace.readFile(canonical)).toBe(content);
            row.expectRealized(workspace, name);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  for (const type of ["skill", "subagent", "mcp-server", "rule", "hook", "knowledge"] as const) {
    it.effect(`disables a Pack-only ${type} through explicit intent`, () => {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const { workspace, registry } = world;
      const name = "review";
      const plural =
        type === "mcp-server" ? "mcps" : type === "knowledge" ? "knowledge" : `${type}s`;
      switch (type) {
        case "skill":
          registry.writeSkill(name, [{ version: "1.0.0", body: "Review." }]);
          break;
        case "subagent":
          registry.writeSubagent(name, [{ version: "1.0.0", body: "Review." }]);
          break;
        case "rule":
          registry.writeRule(name, [{ version: "1.0.0", body: "Review." }]);
          break;
        case "hook":
          registry.writeHook(name, [{ version: "1.0.0" }]);
          break;
        case "knowledge":
          registry.writeKnowledge(name, [{ version: "1.0.0", body: "Review." }]);
          break;
        case "mcp-server":
          registry.writeMcp(name, [{ version: "1.0.0" }]);
          break;
      }
      registry.writePack("reviews", [
        { version: "1.0.0", dependencies: { [`@acme/${plural}/${name}`]: "^1.0.0" } },
      ]);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({
                type: "pack",
                subject: { kind: "source", source: "@acme/packs/reviews" },
              }),
            );
            const accepted = workspace.readFile("axm-lock.yaml");
            yield* applyActivation({ type, name, enabled: false });
            const graph = yield* (yield* WorkspaceMutations).getDesiredStateGraph();
            expect(
              graph.nodes.find((node) => node.type === type && node.name === name)?.enabled,
            ).toBe(false);
            expect(workspace.readFile("axm-lock.yaml")).toBe(accepted);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
    it.effect(
      `disabling a Pack retires its exclusive ${type} and enabling realizes it again`,
      () => {
        const world = makeInstallWorld();
        cleanups.push(world.cleanup);
        const { workspace, registry } = world;
        const name = "review";
        const plural =
          type === "mcp-server" ? "mcps" : type === "knowledge" ? "knowledge" : `${type}s`;
        switch (type) {
          case "skill":
            registry.writeSkill(name, [{ version: "1.0.0", body: "Review." }]);
            break;
          case "subagent":
            registry.writeSubagent(name, [{ version: "1.0.0", body: "Review." }]);
            break;
          case "rule":
            registry.writeRule(name, [{ version: "1.0.0", body: "Review." }]);
            break;
          case "hook":
            registry.writeHook(name, [{ version: "1.0.0" }]);
            break;
          case "knowledge":
            registry.writeKnowledge(name, [{ version: "1.0.0", body: "Review." }]);
            break;
          case "mcp-server":
            registry.writeMcp(name, [{ version: "1.0.0" }]);
            break;
        }
        registry.writePack("reviews", [
          { version: "1.0.0", dependencies: { [`@acme/${plural}/${name}`]: "^1.0.0" } },
        ]);
        return workspace
          .provide(
            Effect.gen(function* () {
              yield* applyInstall(
                installRequest({
                  type: "pack",
                  subject: { kind: "source", source: "@acme/packs/reviews" },
                }),
              );
              const packContent = workspace.readFile(
                "agent_extensions/agentxm/@acme/packs/reviews/pack.json",
              );
              const disabled = yield* applyActivation({
                type: "pack",
                name: "reviews",
                enabled: false,
              });
              expect(disabled._tag === "Resolved" ? disabled.outcome : disabled._tag).toBe(
                "applied",
              );
              const graph = yield* (yield* WorkspaceMutations).getDesiredStateGraph();
              expect(
                graph.nodes.find((node) => node.type === type && node.name === name),
              ).toBeUndefined();
              expect(workspace.exists(`agent_extensions/agentxm/@acme/${plural}/${name}`)).toBe(
                false,
              );
              expect(
                workspace.readFile("agent_extensions/agentxm/@acme/packs/reviews/pack.json"),
              ).toBe(packContent);
              const enabled = yield* applyActivation({
                type: "pack",
                name: "reviews",
                enabled: true,
              });
              expect(enabled._tag === "Resolved" ? enabled.outcome : enabled._tag).toBe("applied");
              expect(workspace.exists(`agent_extensions/agentxm/@acme/${plural}/${name}`)).toBe(
                true,
              );
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );
  }

  it.effect(
    "rejects a newly enabled Pack constraint that conflicts with retained accepted content",
    () => {
      const world = makeInstallWorld({
        settings: { packs: { reviews: { source: "workspace", enabled: false } } },
      });
      cleanups.push(world.cleanup);
      const { workspace, registry } = world;
      registry.writeSkill("review", [{ version: "1.0.0", body: "Accepted review." }]);
      workspace.writeFile(
        "packs/reviews/pack.json",
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "reviews",
          version: "1.0.0",
          description: "Review tools",
          dependencies: { "@acme/skills/review": "^2.0.0" },
        }),
      );
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applyInstall(
              installRequest({
                type: "skill",
                subject: { kind: "source", source: "@acme/skills/review" },
              }),
            );
            const settings = workspace.readFile("axm.json");
            const accepted = workspace.readFile("axm-lock.yaml");
            const content = contentUnder(workspace, "agent_extensions");
            const result = yield* applyActivation({
              type: "pack",
              name: "reviews",
              enabled: true,
            }).pipe(Effect.result);
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result))
              expect(JSON.stringify(result.failure)).toContain("accepted-resolution-incompatible");
            expect(workspace.readFile("axm.json")).toBe(settings);
            expect(workspace.readFile("axm-lock.yaml")).toBe(accepted);
            expect(contentUnder(workspace, "agent_extensions")).toEqual(content);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  /** Every authored file the workspace holds for the extension, as bytes. */
  const authoredContent = (fixture: LifecycleFixture, relative: string) =>
    fixture.readFile(nodePath.join(relative, "src", "SKILL.md"));

  it.effect(
    "disabling a skill suspends its agent surfaces and preserves canonical content and the lockfile",
    () => {
      // Seeded disabled, then enabled, so the projection under test exists
      // because activation created it rather than because a fixture wrote it.
      const fixture = track(
        workspaceWithAuthoredExtension({ type: "skill", name: "code-review", enabled: false }),
      );
      return fixture
        .provide(
          Effect.gen(function* () {
            yield* applyActivation({ type: "skill", name: "code-review", enabled: true });
            expect(fixture.exists(".claude/skills/code-review")).toBe(true);
            const contentBefore = authoredContent(fixture, "skills/code-review");
            const lockBefore = fixture.readFile("axm-lock.yaml");

            const settled = yield* applyActivation({
              type: "skill",
              name: "code-review",
              enabled: false,
            });

            expect(settled._tag).toBe("Resolved");
            expect(fixture.exists(".claude/skills/code-review")).toBe(false);
            // Content and the accepted resolution are untouched: disabling
            // suspends a projection, it does not give back what was acquired.
            expect(authoredContent(fixture, "skills/code-review")).toBe(contentBefore);
            expect(fixture.readFile("axm-lock.yaml")).toBe(lockBefore);
            expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
              skills: { "code-review": { enabled: false } },
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("enabling the skill restores its agent surfaces exactly", () => {
    const fixture = track(
      workspaceWithAuthoredExtension({ type: "skill", name: "code-review", enabled: false }),
    );
    return fixture
      .provide(
        Effect.gen(function* () {
          yield* applyActivation({ type: "skill", name: "code-review", enabled: true });
          const projectedBefore = fixture.readFile(".claude/skills/code-review/SKILL.md");
          const contentBefore = authoredContent(fixture, "skills/code-review");
          const lockBefore = fixture.readFile("axm-lock.yaml");

          yield* applyActivation({ type: "skill", name: "code-review", enabled: false });
          yield* applyActivation({ type: "skill", name: "code-review", enabled: true });

          expect(fixture.readFile(".claude/skills/code-review/SKILL.md")).toBe(projectedBefore);
          expect(authoredContent(fixture, "skills/code-review")).toBe(contentBefore);
          expect(fixture.readFile("axm-lock.yaml")).toBe(lockBefore);
          expect(JSON.parse(fixture.readFile("axm.json"))).not.toMatchObject({
            skills: { "code-review": { enabled: false } },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("disabling and enabling an inline MCP server changes only its agent projection", () => {
    // An inline server is declared in settings and has no acquired package, so
    // it is seeded as the settings entry the workspace records, not installed.
    const fixture = track(
      makeLifecycleFixture({
        settings: {
          agents: ["claude-code"],
          mcpServers: { context: { command: "npx", args: ["context-server"], enabled: false } },
        },
      }),
    );
    return fixture
      .provide(
        Effect.gen(function* () {
          const lockBefore = fixture.readFile("axm-lock.yaml");

          yield* applyActivation({ type: "mcp-server", name: "context", enabled: true });
          expect(fixture.readFile(".mcp.json")).toContain('"context"');
          expect(fixture.readFile("axm-lock.yaml")).toBe(lockBefore);

          yield* applyActivation({ type: "mcp-server", name: "context", enabled: false });
          expect(fixture.readFile(".mcp.json")).not.toContain('"context"');
          expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
            mcpServers: { context: { command: "npx", enabled: false } },
          });
          // The lockfile never moved: an inline server has no acquired package
          // and therefore no accepted resolution to change.
          expect(fixture.readFile("axm-lock.yaml")).toBe(lockBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  /**
   * The two entry-document layouts a Skill can be authored in. Re-enabling
   * has to restore the same bytes from either one, so the rule is exercised
   * across both rather than only the layout the workspace writes itself.
   */
  const FORMAT_NAME = "format-review";

  interface SkillFormatRow {
    readonly format: "agent-skill" | "workspace";
    /** Where the workspace keeps this format's authored Skill content. */
    readonly contentRoot: string;
    readonly seed: () => {
      readonly fixture: LifecycleFixture;
      /** The entry document's bytes, as authored. */
      readonly instructions: string;
      /** A directory the workspace must acquire the Skill from first. */
      readonly installFrom?: string;
    };
  }

  const skillFormats: ReadonlyArray<SkillFormatRow> = [
    {
      format: "agent-skill",
      contentRoot: "agent_extensions",
      seed: () => {
        // A bare `SKILL.md` with no `skill.json` and no `src/`: the layout a
        // Skill arrives in when it was authored for an agent, not for AXM.
        const fixture = makeLifecycleFixture({
          sources: "live",
          settings: { owner: "@acme", agents: ["claude-code"] },
        });
        const source = writeAgentSkillDirectory(fixture.root, { name: FORMAT_NAME });
        return {
          fixture,
          instructions: fs.readFileSync(nodePath.join(source, "SKILL.md"), "utf8"),
          installFrom: source,
        };
      },
    },
    {
      format: "workspace",
      contentRoot: "skills",
      seed: () => {
        const fixture = workspaceWithAuthoredExtension({
          type: "skill",
          name: FORMAT_NAME,
          enabled: false,
        });
        return {
          fixture,
          instructions: fixture.readFile(nodePath.join("skills", FORMAT_NAME, "src", "SKILL.md")),
        };
      },
    },
  ];

  it.effect.each(skillFormats)(
    "restores the $format Skill entry document without changing its content",
    ({ contentRoot, seed }) => {
      const { fixture, instructions, installFrom } = seed();
      track(fixture);
      return fixture
        .provide(
          Effect.gen(function* () {
            if (installFrom !== undefined) {
              yield* applyInstall(
                installRequest({
                  type: "skill",
                  subject: { kind: "source", source: installFrom },
                }),
              );
              yield* applyActivation({ type: "skill", name: FORMAT_NAME, enabled: false });
            }
            const contentBefore = contentUnder(fixture, contentRoot);
            const lockBefore = fixture.readFile("axm-lock.yaml");

            yield* applyActivation({ type: "skill", name: FORMAT_NAME, enabled: true });

            expect(fixture.readFile(`.claude/skills/${FORMAT_NAME}/SKILL.md`)).toBe(instructions);
            expect(fixture.readFile(`.agents/skills/${FORMAT_NAME}/SKILL.md`)).toBe(instructions);
            expect(contentUnder(fixture, contentRoot)).toEqual(contentBefore);
            expect(fixture.readFile("axm-lock.yaml")).toBe(lockBefore);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
