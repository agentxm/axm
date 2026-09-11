import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { applyInstall, contentUnder, installRequest } from "../install/test-helpers.js";
import {
  makeLifecycleFixture,
  writeAgentSkillDirectory,
  type LifecycleFixture,
} from "../testing.js";
import { applyActivation, workspaceWithAuthoredExtension } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/activation-follows-desired-state",
  title: "Activation commands change realized surfaces without touching content or resolutions",
  statement:
    "When an installed extension is disabled or enabled, the workspace shall record the new activation intent and change only that extension's realized agent surfaces, and shall not alter canonical content or accepted resolutions; re-enabling a Skill shall restore its entry document byte for byte for every agent surface, whichever entry-document format the Skill was authored in.",
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
