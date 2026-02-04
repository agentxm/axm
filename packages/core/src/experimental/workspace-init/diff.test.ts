/**
 * Tests for workspace initialization diff computation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import type { AgentConfig, AgentId } from "../agents/types.js";
import type { AgentId as SettingsAgentId } from "../schemas/common.js";
import type { Settings } from "../schemas/settings.js";
import { computeInitDiff } from "./diff.js";
import type { ActualInitState, IdealInitState } from "./types.js";
import { InitValidity } from "./types.js";

// =============================================================================
// Test Helpers
// =============================================================================

const makeAgentConfig = (id: AgentId): AgentConfig => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  skills: {
    projectDir: `.${id}/skills`,
    globalDir: Option.some(`~/.${id}/skills`),
  },
});

const makeSettings = (agents: readonly SettingsAgentId[] = []): Settings => ({
  agents: [...agents],
  scope: "@community",
});

const makeIdealState = (
  agents: AgentConfig[] = [makeAgentConfig("claude-code")],
  scope = "@community",
): IdealInitState => ({
  agents,
  scope,
});

const makeActualState = (validity: InitValidity): ActualInitState => ({
  validity,
});

// =============================================================================
// computeInitDiff Tests
// =============================================================================

describe("computeInitDiff", () => {
  describe("Add change", () => {
    it("returns Add when workspace is not initialized", async () => {
      const actual = makeActualState(InitValidity.NotInitialized());
      const ideal = makeIdealState();

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: false }));

      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result)) {
        expect(result.value.change._tag).toBe("Add");
        if (result.value.change._tag === "Add") {
          expect(result.value.change.ideal).toBe(ideal);
        }
      }
    });

    it("returns Add with force flag when workspace is not initialized", async () => {
      const actual = makeActualState(InitValidity.NotInitialized());
      const ideal = makeIdealState();

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: true }));

      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result)) {
        expect(result.value.change._tag).toBe("Add");
      }
    });
  });

  describe("Update change", () => {
    it("returns Update when workspace is valid and force is true", async () => {
      const settings = makeSettings(["claude-code"]);
      const actual = makeActualState(InitValidity.Valid(settings));
      const ideal = makeIdealState([makeAgentConfig("cursor")]);

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: true }));

      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result)) {
        expect(result.value.change._tag).toBe("Update");
        if (result.value.change._tag === "Update") {
          expect(result.value.change.from).toBe(settings);
          expect(result.value.change.to).toBe(ideal);
        }
      }
    });

    it("returns Update with original settings in from field", async () => {
      const settings = makeSettings(["codex"]);
      const actual = makeActualState(InitValidity.Valid(settings));
      const ideal = makeIdealState([makeAgentConfig("cursor")], "@custom");

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: true }));

      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result) && result.value.change._tag === "Update") {
        expect(result.value.change.from.agents).toEqual(["codex"]);
        expect(result.value.change.to.scope).toBe("@custom");
      }
    });
  });

  describe("Unchanged change", () => {
    it("returns Unchanged when workspace is valid and force is false", async () => {
      const settings = makeSettings(["claude-code"]);
      const actual = makeActualState(InitValidity.Valid(settings));
      const ideal = makeIdealState();

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: false }));

      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result)) {
        expect(result.value.change._tag).toBe("Unchanged");
        if (result.value.change._tag === "Unchanged") {
          expect(result.value.change.settings).toBe(settings);
        }
      }
    });

    it("returns Unchanged with existing settings even if ideal differs", async () => {
      const settings = makeSettings(["codex"]);
      const actual = makeActualState(InitValidity.Valid(settings));
      const ideal = makeIdealState([makeAgentConfig("windsurf")], "@different");

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: false }));

      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result)) {
        expect(result.value.change._tag).toBe("Unchanged");
        if (result.value.change._tag === "Unchanged") {
          expect(result.value.change.settings.agents).toEqual(["codex"]);
        }
      }
    });
  });

  describe("Invalid state handling", () => {
    it("fails when workspace has invalid settings", async () => {
      const actual = makeActualState(InitValidity.Invalid("Schema validation failed"));
      const ideal = makeIdealState();

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: false }));

      expect(Exit.isFailure(result)).toBe(true);
    });

    it("fails with invalid settings even when force is true", async () => {
      const actual = makeActualState(InitValidity.Invalid("Corrupted JSON"));
      const ideal = makeIdealState();

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: true }));

      expect(Exit.isFailure(result)).toBe(true);
    });

    it("includes error message in failure", async () => {
      const actual = makeActualState(InitValidity.Invalid("Custom error message"));
      const ideal = makeIdealState();

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: false }));

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const cause = result.cause;
        expect(cause._tag).toBe("Fail");
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty agents array in ideal state", async () => {
      const actual = makeActualState(InitValidity.NotInitialized());
      const ideal: IdealInitState = { agents: [], scope: "@community" };

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: false }));

      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result)) {
        expect(result.value.change._tag).toBe("Add");
      }
    });

    it("handles multiple agents in ideal state", async () => {
      const actual = makeActualState(InitValidity.NotInitialized());
      const ideal = makeIdealState([
        makeAgentConfig("claude-code"),
        makeAgentConfig("cursor"),
        makeAgentConfig("windsurf"),
      ]);

      const result = await Effect.runPromiseExit(computeInitDiff(actual, ideal, { force: false }));

      expect(Exit.isSuccess(result)).toBe(true);
      if (Exit.isSuccess(result) && result.value.change._tag === "Add") {
        expect(result.value.change.ideal.agents).toHaveLength(3);
      }
    });
  });
});
