import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  CodingAgentRepository,
  kiroCliCodingAgent,
  type AddCommandArgs,
  type CodingAgent,
  type CodingAgentRepositoryService,
} from "../../agents/index.js";
import type { AgentId } from "../../agents/types.js";
import { makeAppError } from "../../app-error/index.js";
import { makeCodingAgentStub } from "../../test-helpers.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import { parseCommandMd } from "../command-content.js";
import { readCommandContent, renderToAgents } from "./shared-command-helpers.js";

const makeRepo = (agents: ReadonlyArray<CodingAgent>): CodingAgentRepositoryService => ({
  get: (id) => {
    const found = agents.find((agent) => agent.id === id);
    if (found !== undefined) return Effect.succeed(found);
    return Effect.fail(
      makeAppError({
        code: "not_found",
        message: `Agent ${id} not found`,
      }),
    );
  },
  all: Effect.succeed(agents),
  getConfiguredAgents: () => Effect.succeed(agents),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
});

const makeCapturingAgent = (id: AgentId, calls: Array<AddCommandArgs>): CodingAgent =>
  makeCodingAgentStub(id, {
    addCommand: (args) =>
      Effect.sync(() => {
        calls.push(args);
        return {
          _tag: "success" as const,
          renderedFilePath: `${args.workspaceRoot}/.${id}/commands/${args.commandName}.md`,
          warnings: [],
        };
      }),
  });

const withServices = (repo: CodingAgentRepositoryService, workspaceRoot: string) =>
  Layer.mergeAll(
    NodeServices.layer,
    WorkspaceMutations.layer(
      makeBaseWorkspaceMock(path.join(workspaceRoot, ".axm"), { baseDir: workspaceRoot }),
    ),
    Layer.succeed(CodingAgentRepository, repo),
  );

describe("renderToAgents", () => {
  it.effect("sources agentOverrides from parsed command frontmatter and strips the meta key", () =>
    Effect.gen(function* () {
      const claudeCalls: Array<AddCommandArgs> = [];
      const codexCalls: Array<AddCommandArgs> = [];
      const parsed = yield* parseCommandMd(`---
description: Deploy app
agentOverrides:
  claude-code:
    model: opus
  codex:
    model: o3
---
Deploy the app.`);

      yield* renderToAgents({
        commandName: "deploy",
        frontmatter: parsed.frontmatter,
        agentOverrides: Option.getOrUndefined(parsed.agentOverrides),
        body: parsed.body,
        manifest: undefined,
        owner: "@acme",
        workspaceRoot: "/workspace",
        force: false,
      }).pipe(
        Effect.provide(
          withServices(
            makeRepo([
              makeCapturingAgent("claude-code", claudeCalls),
              makeCapturingAgent("codex", codexCalls),
            ]),
            "/workspace",
          ),
        ),
      );

      const claudeArgs = claudeCalls[0];
      const codexArgs = codexCalls[0];
      if (claudeArgs === undefined || codexArgs === undefined) {
        throw new Error("Expected both agents to receive addCommand");
      }

      expect(Option.getOrThrow(claudeArgs.frontmatter)).toEqual({
        description: "Deploy app",
      });
      expect(Option.getOrThrow(claudeArgs.agentOverrides)).toEqual({ model: "opus" });
      expect(Option.getOrThrow(codexArgs.frontmatter)).toEqual({
        description: "Deploy app",
      });
      expect(Option.getOrThrow(codexArgs.agentOverrides)).toEqual({ model: "o3" });
    }),
  );

  it.effect("does not warn for agentOverrides-only frontmatter on lossy plain-text renderers", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-kiro-")))),
      (workspaceRoot) =>
        Effect.gen(function* () {
          const parsed = yield* parseCommandMd(`---
agentOverrides:
  codex:
    model: o3
---
Plain body.`);

          const result = yield* renderToAgents({
            commandName: "plain",
            frontmatter: parsed.frontmatter,
            agentOverrides: Option.getOrUndefined(parsed.agentOverrides),
            body: parsed.body,
            manifest: undefined,
            owner: "@acme",
            workspaceRoot,
            force: false,
          }).pipe(Effect.provide(withServices(makeRepo([kiroCliCodingAgent]), workspaceRoot)));

          const first = result.outcomes[0];
          if (first === undefined || first.outcome._tag !== "success") {
            throw new Error("Expected Kiro command render to succeed");
          }

          expect(first.outcome.warnings).toEqual([]);
          expect(
            fs.readFileSync(path.join(workspaceRoot, ".kiro", "prompts", "plain.txt"), "utf8"),
          ).toBe("Plain body.");
        }),
      (workspaceRoot) =>
        Effect.sync(() => fs.rmSync(workspaceRoot, { recursive: true, force: true })),
    ),
  );
});

describe("readCommandContent", () => {
  it.effect("rejects command manifests that still contain agentOverrides", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-command-")))),
      (commandDir) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            fs.mkdirSync(path.join(commandDir, "src"), { recursive: true });
            fs.writeFileSync(path.join(commandDir, "src", "deploy.md"), "Deploy.");
            fs.writeFileSync(
              path.join(commandDir, "command.json"),
              JSON.stringify({
                owner: "@acme",
                type: "command",
                name: "deploy",
                version: "1.0.0",
                agentOverrides: { codex: { model: "o3" } },
              }),
            );
          });

          const error = yield* readCommandContent(commandDir, "deploy", "INSTALL_COMMAND").pipe(
            Effect.provide(NodeServices.layer),
            Effect.flip,
          );

          expect(error.message).toContain("command content file frontmatter");
        }),
      (commandDir) => Effect.sync(() => fs.rmSync(commandDir, { recursive: true, force: true })),
    ),
  );
});
