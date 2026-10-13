import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import {
  ProjectionIoFailed,
  projectionOutputDigest,
  type ProjectionOutputObservation,
} from "@agentxm/workspace-kernel/projection";
import {
  ProjectionUnitPathSchema,
  UNCONSTRAINED_DESIRED_NODE,
  type DesiredExtensionNode,
  type DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import { contextFor, validLockfile, validSettings } from "./conformance/test-helpers.js";
import { projectionModifiedRule } from "./projection-modified.js";

const modified = (
  kind: ProjectionOutputObservation["kind"],
  path: string,
): ProjectionOutputObservation => ({
  kind,
  path: ProjectionUnitPathSchema.make(path),
  recorded: projectionOutputDigest("written"),
  observed: projectionOutputDigest("edited"),
});

const node = (
  type: ExtensionType,
  name: string,
  authority: "workspace" | "bundled",
): DesiredExtensionNode => ({
  type,
  name,
  identity: { authority, fqn: `@acme/${type}s/${name}` },
  enabled: true,
  origins: [],
  source: name,
  constraint: UNCONSTRAINED_DESIRED_NODE,
});

const graph = (nodes: ReadonlyArray<DesiredExtensionNode>): DesiredStateGraph => ({
  nodes,
  mcpSourceClosures: [],
  problems: [],
  packMembership: [],
});

const contextWith = (args: {
  readonly observations: ReadonlyArray<ProjectionOutputObservation>;
  readonly nodes?: ReadonlyArray<DesiredExtensionNode>;
  readonly canonicalPaths?: Readonly<Record<string, string>>;
  readonly settings?: object;
}) =>
  contextFor({ settings: validSettings(args.settings), lockfile: validLockfile }).pipe(
    Effect.map((context): WorkspaceRuleContext => ({
      ...context,
      projectionOutputs: Effect.succeed(args.observations.map(Result.succeed)),
      health: {
        desiredState: Effect.succeed(graph(args.nodes ?? [])),
        canonicalObservations: Effect.succeed(
          (args.nodes ?? []).map((desired) => ({
            desired,
            observation: {
              type: desired.type,
              name: desired.name,
              status: "usable" as const,
              ...(args.canonicalPaths?.[desired.name] === undefined
                ? {}
                : { path: args.canonicalPaths[desired.name] }),
            },
          })),
        ),
      },
    })),
  );

const messages = (context: WorkspaceRuleContext) =>
  projectionModifiedRule
    .check(context)
    .pipe(Effect.map((findings) => findings.map(({ message }) => message)));

const PREFIX = "differs from what AXM last wrote; AXM replaces it when its inputs change.";

describe("workspace/projection-modified", () => {
  it.effect("names every Rule contributor, forking acquired ones and editing authored ones", () =>
    Effect.gen(function* () {
      const context = yield* contextWith({
        observations: [modified("rules", "AGENTS.md")],
        nodes: [node("rule", "style", "bundled"), node("rule", "local", "workspace")],
        canonicalPaths: { local: "/workspace/rules/local" },
      });
      expect(yield* messages(context)).toEqual([
        `\`AGENTS.md\` ${PREFIX} The region is generated from: @acme/rules/style (run \`axm fork @acme/rules/style <new-extension>\` and edit the fork), @acme/rules/local (edit \`rules/local\`).`,
      ]);
    }),
  );

  it.effect("lists at most five contributors, then counts the rest", () =>
    Effect.gen(function* () {
      const context = yield* contextWith({
        observations: [modified("knowledge", "AGENTS.md")],
        nodes: ["a", "b", "c", "d", "e", "f", "g"].map((name) =>
          node("knowledge", name, "workspace"),
        ),
      });
      const [message] = yield* messages(context);
      expect(message).toContain("@acme/knowledges/e (edit its authored source), and 2 more.");
      expect(message).not.toContain("@acme/knowledges/f");
    }),
  );

  it.effect("names the declared Subagent a projected file comes from", () =>
    Effect.gen(function* () {
      const context = yield* contextWith({
        observations: [modified("subagents", ".claude/agents/reviewer.md")],
        nodes: [node("subagent", "reviewer", "bundled")],
      });
      expect(yield* messages(context)).toEqual([
        `\`.claude/agents/reviewer.md\` ${PREFIX} Change @acme/subagents/reviewer (run \`axm fork @acme/subagents/reviewer <new-extension>\` and edit the fork).`,
      ]);
    }),
  );

  it.effect("names the settings behind the .gitignore alias region", () =>
    Effect.gen(function* () {
      const context = yield* contextWith({
        observations: [modified("instructions", ".gitignore")],
        settings: { instructionFiles: { fileName: "AGENTS.md" } },
      });
      expect(yield* messages(context)).toEqual([
        `\`.gitignore\` ${PREFIX} The region lists the configured agents' instruction aliases; change \`agents\` or \`instructionFiles.gitignoreAliases\` in settings.`,
      ]);
    }),
  );

  it.effect("tells a person to withdraw a unit nothing declares any more", () =>
    Effect.gen(function* () {
      const context = yield* contextWith({
        observations: [
          modified("subagents", ".claude/agents/gone.md"),
          modified("rules", "AGENTS.md"),
          modified("instructions", "CLAUDE.md"),
          modified("instructions", ".gitignore"),
        ],
      });
      expect(yield* messages(context)).toEqual([
        `\`.claude/agents/gone.md\` ${PREFIX} Run \`axm sync\` to withdraw it.`,
        `\`AGENTS.md\` ${PREFIX} Run \`axm sync\` to withdraw it.`,
        `\`CLAUDE.md\` ${PREFIX} Run \`axm sync\` to withdraw it.`,
        `\`.gitignore\` ${PREFIX} Run \`axm sync\` to withdraw it.`,
      ]);
    }),
  );

  it.effect("reports nothing for units that match their last write", () =>
    Effect.gen(function* () {
      const context = yield* contextWith({
        observations: [
          {
            ...modified("instructions", "CLAUDE.md"),
            observed: projectionOutputDigest("written"),
          },
        ],
      });
      expect(yield* messages(context)).toEqual([]);
    }),
  );

  it.effect("reports a unit it could not read by path, without hiding the others", () =>
    Effect.gen(function* () {
      const base = yield* contextWith({ observations: [] });
      const context: WorkspaceRuleContext = {
        ...base,
        projectionOutputs: Effect.succeed([
          Result.fail(new ProjectionIoFailed({ path: "CLAUDE.md", step: "read", cause: "EACCES" })),
          Result.succeed(modified("subagents", ".claude/agents/gone.md")),
        ]),
      };
      expect(yield* projectionModifiedRule.check(context)).toEqual([
        {
          kind: "advisory",
          ruleId: "workspace/projection-modified",
          severity: "info",
          message: "`CLAUDE.md` could not be read to compare it with what AXM last wrote.",
          location: { file: "CLAUDE.md" },
        },
        {
          kind: "advisory",
          ruleId: "workspace/projection-modified",
          severity: "info",
          message: `\`.claude/agents/gone.md\` ${PREFIX} Run \`axm sync\` to withdraw it.`,
          location: { file: ".claude/agents/gone.md" },
        },
      ]);
    }),
  );
});
