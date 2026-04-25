import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { claudeCodeCodingAgent } from "./claude-code/service.js";
import { codexCodingAgent } from "./codex/service.js";
import { kiroCliCodingAgent } from "./kiro-cli/service.js";
import { rooCodingAgent } from "./roo/service.js";
import type { AddSubagentArgs, CodingAgent, RemoveSubagentArgs } from "./coding-agent.js";
import type { SubagentRenderInput } from "../subagents/rendering/types.js";
import * as Schema from "effect/Schema";

const TestLayer = NodeServices.layer;
const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(TestLayer));

const decodeRenderedFilePath = Schema.decodeUnknownSync(
  Schema.String.pipe(Schema.brand("RenderedFilePath")),
);

const makeRenderInput = (name = "test-subagent"): SubagentRenderInput => ({
  agentId: "claude-code",
  name,
  description: "A test subagent for unit tests.",
  model: "default",
  toolAccess: "full",
  background: false,
  body: "You are a helpful test subagent.",
  agentOverrides: undefined,
});

const makeAddArgs = (
  workspaceRoot: string,
  agentId: string,
  name = "test-subagent",
): AddSubagentArgs => ({
  workspaceRoot,
  scope: "project",
  input: { ...makeRenderInput(name), agentId },
  force: false,
});

const makeRemoveArgs = (
  workspaceRoot: string,
  renderedFilePaths: ReadonlyArray<string>,
  name = "test-subagent",
): RemoveSubagentArgs => ({
  workspaceRoot,
  scope: "project",
  subagentName: name,
  renderedFilePaths: renderedFilePaths.map((p) => decodeRenderedFilePath(p)),
});

describe("resolveEffectiveSubagentsDir", () => {
  describe("claude-code", () => {
    it.effect("resolves project-scope subagents dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* claudeCodeCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".claude/agents");
          }
        }),
      ),
    );

    it.effect("resolves user-scope subagents dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* claudeCodeCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".claude/agents");
          }
        }),
      ),
    );
  });

  describe("codex", () => {
    it.effect("resolves project-scope subagents dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* codexCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".codex/agents");
          }
        }),
      ),
    );
  });

  describe("kiro-cli", () => {
    it.effect("resolves project-scope subagents dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* kiroCliCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".kiro/agents");
          }
        }),
      ),
    );

    it.effect("returns unsupported for user scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* kiroCliCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("unsupported");
        }),
      ),
    );
  });

  describe("roo", () => {
    it.effect("resolves project-scope subagents dir to .roomodes", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* rooCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".roomodes");
          }
        }),
      ),
    );

    it.effect("returns unsupported for user scope", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* rooCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("unsupported");
        }),
      ),
    );
  });
});

describe("addSubagent", () => {
  const testAddSubagent = (agent: CodingAgent, expectedSubpath: string) =>
    it.effect(`${agent.id} writes subagent file`, () =>
      withNode(
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), `axm-${agent.id}-subagent-`));
          try {
            const outcome = yield* agent.addSubagent(makeAddArgs(workspaceRoot, agent.id));
            if (outcome._tag === "unsupported") {
              return;
            }
            expect(outcome._tag).toBe("success");
            if (outcome._tag === "success") {
              expect(outcome.renderedFilePaths.length).toBeGreaterThan(0);
              const fs = yield* FileSystem.FileSystem;
              for (const filePath of outcome.renderedFilePaths) {
                expect(filePath).toContain(expectedSubpath);
                const content = yield* fs.readFileString(filePath);
                expect(content.length).toBeGreaterThan(0);
              }
            }
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
    );

  testAddSubagent(claudeCodeCodingAgent, ".claude/agents/test-subagent.md");
  testAddSubagent(codexCodingAgent, ".codex/agents/test-subagent.toml");

  it.effect("kiro-cli writes dual-format files (md + json)", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-kiro-cli-subagent-"));
        try {
          const outcome = yield* kiroCliCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "kiro-cli"),
          );
          expect(outcome._tag).toBe("success");
          if (outcome._tag === "success") {
            // Kiro dual-format produces two files
            expect(outcome.renderedFilePaths.length).toBe(2);
            const fs = yield* FileSystem.FileSystem;
            const hasMd = outcome.renderedFilePaths.some((p) => p.endsWith(".md"));
            const hasJson = outcome.renderedFilePaths.some((p) => p.endsWith(".json"));
            expect(hasMd).toBe(true);
            expect(hasJson).toBe(true);
            for (const filePath of outcome.renderedFilePaths) {
              const content = yield* fs.readFileString(filePath);
              expect(content.length).toBeGreaterThan(0);
            }
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("roo writes subagent as mode entry in .roomodes", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-roo-subagent-"));
        try {
          const outcome = yield* rooCodingAgent.addSubagent(makeAddArgs(workspaceRoot, "roo"));
          expect(outcome._tag).toBe("success");
          if (outcome._tag === "success") {
            expect(outcome.renderedFilePaths.length).toBe(1);
            const fs = yield* FileSystem.FileSystem;
            const firstPath = outcome.renderedFilePaths[0];
            expect(firstPath).toBeDefined();
            if (firstPath === undefined) return;
            const content = yield* fs.readFileString(firstPath);
            const parsed: unknown = JSON.parse(content);
            expect(parsed).toHaveProperty("customModes");
            const modes = (parsed as Record<string, unknown>)["customModes"]; // Assertion needed: test boundary parsing JSON
            expect(Array.isArray(modes)).toBe(true);
            if (!Array.isArray(modes)) return;
            expect(modes.length).toBe(1);
            const firstMode = modes[0] as Record<string, unknown>; // Assertion needed: test boundary array element
            expect(firstMode["slug"]).toBe("test-subagent");
            expect(firstMode["_axm_managed"]).toBeUndefined();
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});

describe("removeSubagent", () => {
  it.effect("claude-code removes existing subagent file", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-rm-subagent-"));
        try {
          // First add a subagent
          const addOutcome = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(addOutcome._tag).toBe("success");
          if (addOutcome._tag !== "success") return;

          // Then remove it
          const removeOutcome = yield* claudeCodeCodingAgent.removeSubagent(
            makeRemoveArgs(workspaceRoot, addOutcome.renderedFilePaths),
          );
          expect(removeOutcome._tag).toBe("success");

          // Verify file is gone
          const fs = yield* FileSystem.FileSystem;
          for (const filePath of addOutcome.renderedFilePaths) {
            const exists = yield* fs
              .exists(filePath)
              .pipe(Effect.catch(() => Effect.succeed(false)));
            expect(exists).toBe(false);
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("handles file-not-found gracefully", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-rm-subagent-"));
        try {
          const outcome = yield* claudeCodeCodingAgent.removeSubagent(
            makeRemoveArgs(workspaceRoot, [
              nodePath.join(workspaceRoot, ".claude/agents/nonexistent.md"),
            ]),
          );
          expect(outcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("roo removes mode entry from .roomodes", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-rm-roo-subagent-"));
        try {
          // Add a subagent
          const addOutcome = yield* rooCodingAgent.addSubagent(makeAddArgs(workspaceRoot, "roo"));
          expect(addOutcome._tag).toBe("success");
          if (addOutcome._tag !== "success") return;

          // Remove it
          const removeOutcome = yield* rooCodingAgent.removeSubagent({
            workspaceRoot,
            scope: "project",
            subagentName: "test-subagent",
            renderedFilePaths: addOutcome.renderedFilePaths.map((p) => decodeRenderedFilePath(p)),
          });
          expect(removeOutcome._tag).toBe("success");

          // Verify mode entry is gone
          const fs = yield* FileSystem.FileSystem;
          const roomodesPath = nodePath.join(workspaceRoot, ".roomodes");
          const content = yield* fs.readFileString(roomodesPath);
          const parsed: unknown = JSON.parse(content);
          expect(parsed).toHaveProperty("customModes");
          const modes = (parsed as Record<string, unknown>)["customModes"]; // Assertion needed: test boundary parsing JSON
          expect(Array.isArray(modes)).toBe(true);
          if (Array.isArray(modes)) {
            expect(modes.length).toBe(0);
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});

describe("overwrite behavior", () => {
  it.effect("overwrites existing file without marker checks", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-conflict-subagent-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nodePath.join(workspaceRoot, ".claude/agents"), {
            recursive: true,
          });
          yield* fs.writeFileString(
            nodePath.join(workspaceRoot, ".claude/agents/test-subagent.md"),
            "user-owned content without marker",
          );
          const outcome = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(outcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("re-renders existing file successfully", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-managed-subagent-"));
        try {
          // First render
          const first = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(first._tag).toBe("success");

          const second = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(second._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("proceeds when no file exists", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-nofile-subagent-"));
        try {
          const outcome = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(outcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("roo replaces existing mode with the same slug", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-roo-conflict-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          // Write a .roomodes with a manually-defined mode with same slug
          const existingContent = JSON.stringify({
            customModes: [
              {
                slug: "test-subagent",
                name: "Test Subagent",
                roleDefinition: "Manual definition",
                groups: ["read"],
              },
            ],
          });
          yield* fs.writeFileString(nodePath.join(workspaceRoot, ".roomodes"), existingContent);
          const outcome = yield* rooCodingAgent.addSubagent(makeAddArgs(workspaceRoot, "roo"));
          expect(outcome._tag).toBe("success");
          if (outcome._tag !== "success") return;
          const content = yield* fs.readFileString(nodePath.join(workspaceRoot, ".roomodes"));
          const parsed = JSON.parse(content) as { customModes: Array<Record<string, unknown>> };
          expect(parsed.customModes).toHaveLength(1);
          expect(parsed.customModes[0]?.["roleDefinition"]).toBe(
            "You are a helpful test subagent.",
          );
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
