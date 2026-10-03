import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import {
  applyActivation,
  previewActivation,
  workspaceWithAuthoredExtension,
} from "./test-helpers.js";
import type { LifecycleFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "workspace/instructions/aliases-follow-shared-surface-writes",
  title: "Shared instruction-surface writes update owned aliases",
  statement:
    "When an operation rewrites a contributed region of the canonical instruction file while instruction-file management is enabled, AXM shall leave every owned alias current in that same operation and shall refuse the operation before writing when an alias target is unowned or the managed ignore region is unrecognizable.",
  class: "functional",
  role: "supporting",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "platform",
  boundaryRationale:
    "Lifecycle operations and scoped sync write real workspace files; the examples inspect the canonical file and alias after the same transaction.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const configureInstructions = (workspace: LifecycleFixture) => {
  workspace.writeFile(
    "axm.json",
    `${JSON.stringify({
      owner: "@acme",
      agents: ["claude-code"],
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
      knowledge: {
        review: { source: "workspace", enabled: false },
      },
    })}\n`,
  );
  workspace.writeFile("AGENTS.md", "# Workspace\n");
};

describe("Instruction aliases follow shared-surface writes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("refreshes an owned alias after enabling Knowledge", () => {
    const type = "knowledge";
    const workspace = workspaceWithAuthoredExtension({ type, name: "review", enabled: false });
    cleanups.push(workspace.cleanup);
    configureInstructions(workspace);
    workspace.writeFile(
      "CLAUDE.md",
      "<!-- axm:file v=1 ext=@agentxm/instructions/alias src=AGENTS.md -->\n\n# Old copy\n",
    );
    return workspace
      .provide(
        Effect.gen(function* () {
          const result = yield* applyActivation({ type, name: "review", enabled: true });
          expect(result._tag === "Resolved" ? result.outcome : result._tag).toBe("applied");
          const canonical = workspace.readFile("AGENTS.md");
          const alias = workspace.readFile("CLAUDE.md");
          expect(canonical).toContain("region=knowledge");
          expect(alias).toContain(canonical.trim());
          expect(alias).not.toContain("# Old copy");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("blocks a Knowledge preview when an alias is unowned", () => {
    const workspace = workspaceWithAuthoredExtension({
      type: "knowledge",
      name: "review",
      enabled: false,
    });
    cleanups.push(workspace.cleanup);
    configureInstructions(workspace);
    workspace.writeFile("CLAUDE.md", "# Human-owned\n");
    const canonicalPath = nodePath.join(workspace.root, "AGENTS.md");
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = fs.readFileSync(canonicalPath, "utf8");
          const result = yield* previewActivation({
            type: "knowledge",
            name: "review",
            enabled: true,
          });
          expect(result._tag === "Resolved" ? result.outcome : result._tag).toBe("blocked");
          expect(fs.readFileSync(canonicalPath, "utf8")).toBe(before);
          expect(workspace.readFile("CLAUDE.md")).toBe("# Human-owned\n");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
