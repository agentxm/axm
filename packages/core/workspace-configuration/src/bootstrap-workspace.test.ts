/**
 * Unit tests for the `bootstrapWorkspace` initialization flow: agent
 * selection prompting, non-interactive auto-selection, and detection-driven
 * defaults. Extracted from the workspace facade test when the facade moved
 * into the workspace kernels; initialization is a workspace-configuration
 * feature.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceMutationsOptions } from "@agentxm/workspace-state";
import { bootstrapWorkspace } from "./index.js";
import { WorkspaceInitializationInteractionTest } from "./testing.js";

describe("bootstrapWorkspace", () => {
  let tempDir: string;
  let projectDir: string;
  let homeDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let defaultOptions: WorkspaceMutationsOptions;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-bootstrap-test-"));

    // Separate project and home dirs so local != global .axm
    projectDir = path.join(tempDir, "project");
    homeDir = path.join(tempDir, "home");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });

    process.chdir(projectDir);
    process.env["HOME"] = homeDir;
    defaultOptions = {
      scope: "project",
      projectRoot: decodeAbsolutePathSync(projectDir),
    };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create workspace layer with custom TUI behaviors for init testing.
   * Uses multiselect behavior to control which agents are "selected".
   */
  const getServiceWithInit = (flags: {
    nonInteractive?: boolean;
    yes?: boolean;
    preview?: boolean;
  }) => {
    const workspaceInitInteraction = WorkspaceInitializationInteractionTest({
      selectAgents: () => Effect.succeed([]),
    });
    const base = Layer.mergeAll(NodeServices.layer, workspaceInitInteraction.layer);
    // Initialization reads non-interactivity from the options, not the flag.
    const wsOptions = {
      ...defaultOptions,
      ...(flags.nonInteractive === undefined ? {} : { nonInteractive: flags.nonInteractive }),
      ...(flags.yes === undefined ? {} : { yes: flags.yes }),
      ...(flags.preview === undefined ? {} : { preview: flags.preview }),
    };
    return {
      run: bootstrapWorkspace(wsOptions).pipe(
        Effect.map((r) => r.settings),
        Effect.provide(base),
        Effect.scoped,
      ),
      promptState: workspaceInitInteraction.state,
    };
  };

  it.effect("interactive mode calls multiselect directly (no select prompt)", () =>
    Effect.gen(function* () {
      const { run, promptState } = getServiceWithInit({
        nonInteractive: false,
      });

      yield* run;

      // Should have called multiselect once (no select prompt)
      expect(promptState.selectAgentsCalls).toHaveLength(1);
      expect(promptState.selectAgentsCalls[0]).toEqual(
        expect.objectContaining({
          detectedIds: expect.any(Array),
        }),
      );
    }),
  );

  it.effect("--non-interactive auto-selects detected agents without prompting", () =>
    Effect.gen(function* () {
      // Create .claude dir in project to trigger detection
      fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });

      const { run, promptState } = getServiceWithInit({
        nonInteractive: true,
      });

      const settings = yield* run;

      // --non-interactive skips prompting entirely
      expect(promptState.selectAgentsCalls).toHaveLength(0);
      // claude-code should be auto-selected via project-level detection
      expect(settings.agents).toContain("claude-code");
    }),
  );

  it.effect("an interactive setup without preapproval prompts for agent selection", () =>
    Effect.gen(function* () {
      // Create .claude dir in project to trigger detection
      fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });

      const { run, promptState } = getServiceWithInit({
        nonInteractive: false,
      });

      yield* run;

      expect(promptState.selectAgentsCalls).toHaveLength(1);
    }),
  );

  it.effect("an interactive preview resolves every input from documented defaults", () =>
    Effect.gen(function* () {
      fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });
      fs.writeFileSync(path.join(projectDir, "CLAUDE.md"), "# Existing\n");

      const { run, promptState } = getServiceWithInit({
        nonInteractive: false,
        preview: true,
      });

      const settings = yield* run;

      expect(promptState.selectAgentsCalls).toEqual([]);
      expect(promptState.confirmInstructionSyncCalls).toEqual([]);
      expect(promptState.selectInstructionSourceCalls).toEqual([]);
      expect(promptState.confirmSetupPlanCalls).toEqual([]);
      expect(settings.agents).toEqual(["claude-code"]);
      expect(settings.instructionFiles).toEqual({ fileName: "AGENTS.md", gitignoreAliases: true });
      // The presented candidate names the seed the default source would take.
      expect(promptState.presentSetupPlanCalls[0]).toContainEqual({
        target: "AGENTS.md",
        action: "create",
        detail: "seeded from CLAUDE.md",
      });
      expect(fs.existsSync(path.join(projectDir, "axm.json"))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, "AGENTS.md"))).toBe(false);
    }),
  );

  it.effect("a preview resolves identical inputs with and without preapproval", () =>
    Effect.gen(function* () {
      fs.mkdirSync(path.join(projectDir, ".claude"), { recursive: true });

      const withoutApproval = getServiceWithInit({ nonInteractive: false, preview: true });
      const withApproval = getServiceWithInit({
        nonInteractive: false,
        preview: true,
        yes: true,
      });

      const unapproved = yield* withoutApproval.run;
      const approved = yield* withApproval.run;

      expect(unapproved).toEqual(approved);
      expect(withoutApproval.promptState.presentSetupPlanCalls).toEqual(
        withApproval.promptState.presentSetupPlanCalls,
      );
      expect(withoutApproval.promptState.confirmInstructionSyncCalls).toEqual([]);
      expect(withoutApproval.promptState.selectInstructionSourceCalls).toEqual([]);
      expect(withApproval.promptState.confirmInstructionSyncCalls).toEqual([]);
      expect(withApproval.promptState.selectInstructionSourceCalls).toEqual([]);
    }),
  );
});
