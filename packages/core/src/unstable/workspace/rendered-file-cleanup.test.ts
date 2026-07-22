import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CodingAgentRepository, makeProjectOnlyCodingAgent } from "../agents/index.js";
import type { CodingAgentRepositoryService } from "../agents/index.js";
import { WorkspaceMutations } from "./service-interface.js";
import { makeBaseWorkspaceMock } from "./test-stubs.js";
import {
  AXM_MANAGED_MARKER,
  cleanupManagedArtifactsForRemovedAgents,
  hasAxmManagedMarker,
} from "./index.js";

describe("cleanupManagedArtifactsForRemovedAgents", () => {
  it.effect(
    "removes only AXM-managed skill, command, and subagent artifacts for removed agents",
    () =>
      Effect.gen(function* () {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-agent-cleanup-"));
        try {
          const axmDir = path.join(tempDir, ".axm");
          const canonicalSkill = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "code-review",
            "src",
          );
          const cursorSkills = path.join(tempDir, ".cursor", "skills");
          const cursorCommands = path.join(tempDir, ".cursor", "commands");
          const cursorSubagents = path.join(tempDir, ".cursor", "agents");
          fs.mkdirSync(canonicalSkill, { recursive: true });
          fs.mkdirSync(cursorSkills, { recursive: true });
          fs.mkdirSync(cursorCommands, { recursive: true });
          fs.mkdirSync(cursorSubagents, { recursive: true });

          const managedSkillLink = path.join(cursorSkills, "code-review");
          const unmanagedSkill = path.join(cursorSkills, "user-skill");
          fs.symlinkSync(canonicalSkill, managedSkillLink);
          fs.mkdirSync(unmanagedSkill, { recursive: true });
          fs.writeFileSync(path.join(unmanagedSkill, "SKILL.md"), "# User skill\n");

          const managedCommand = path.join(cursorCommands, "code-review.md");
          const unmanagedCommand = path.join(cursorCommands, "manual.md");
          fs.writeFileSync(managedCommand, `# ${AXM_MANAGED_MARKER}\ncommand body\n`);
          fs.writeFileSync(unmanagedCommand, "# Manual command\n");

          const managedSubagent = path.join(cursorSubagents, "reviewer.md");
          const unmanagedSubagent = path.join(cursorSubagents, "manual.md");
          fs.writeFileSync(managedSubagent, `# ${AXM_MANAGED_MARKER}\nsubagent body\n`);
          fs.writeFileSync(unmanagedSubagent, "# Manual subagent\n");

          const cursor = makeProjectOnlyCodingAgent({
            agentId: "cursor",
            displayName: "Cursor",
            skillsProjectDir: ".cursor/skills",
            commandsProjectDir: ".cursor/commands",
            subagentsProjectDir: ".cursor/agents",
          });
          const agentRepo: CodingAgentRepositoryService = {
            get: () => Effect.succeed(cursor),
            all: Effect.succeed([cursor]),
            getConfiguredAgents: () => Effect.succeed([]),
            getMaterializationAgents: () => Effect.succeed([]),
            getUnknownConfiguredAgentIds: () => Effect.succeed([]),
          };
          const layer = Layer.mergeAll(
            NodeServices.layer,
            Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock(axmDir)),
            Layer.succeed(CodingAgentRepository, agentRepo),
          );

          const result = yield* cleanupManagedArtifactsForRemovedAgents({
            removedAgentIds: new Set(["cursor"]),
          }).pipe(Effect.provide(layer));

          expect(result.removedPaths).toEqual(
            expect.arrayContaining([managedSkillLink, managedCommand, managedSubagent]),
          );
          expect(fs.existsSync(managedSkillLink)).toBe(false);
          expect(fs.existsSync(managedCommand)).toBe(false);
          expect(fs.existsSync(managedSubagent)).toBe(false);
          expect(fs.existsSync(unmanagedSkill)).toBe(true);
          expect(fs.existsSync(unmanagedCommand)).toBe(true);
          expect(fs.existsSync(unmanagedSubagent)).toBe(true);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }),
  );
});

describe("hasAxmManagedMarker", () => {
  it("matches the full managed-file banner", () => {
    expect(hasAxmManagedMarker("<!-- AXM managed file — do not edit directly -->")).toBe(true);
    expect(hasAxmManagedMarker('{"_axm_managed": true}')).toBe(true);
  });

  it("does not match a user file that merely mentions the phrase", () => {
    // A user-authored command/subagent file that references "AXM managed" (e.g.
    // documentation) must not be treated as a managed artifact and deleted.
    expect(hasAxmManagedMarker("# Notes on how AXM managed extensions work")).toBe(false);
    expect(hasAxmManagedMarker("This skill explains AXM managed regions.")).toBe(false);
  });
});
