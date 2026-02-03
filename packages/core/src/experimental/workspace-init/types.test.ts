/**
 * Tests for workspace-init state types module.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import type { Settings } from "../schemas/settings.js";
import type { AgentConfig } from "../skills/types.js";
import type { ActualInitState, IdealInitState, InitDiff } from "./types.js";
import { hasInitChanges, InitChange, InitValidity } from "./types.js";

describe("InitValidity constructors", () => {
  it("creates Valid variant with settings", () => {
    const settings: Settings = { scope: "@community", agents: ["claude-code"] };
    const valid = InitValidity.Valid(settings);
    expect(valid._tag).toBe("Valid");
    if (valid._tag === "Valid") {
      expect(valid.settings.scope).toBe("@community");
    }
  });

  it("creates NotInitialized variant", () => {
    const validity = InitValidity.NotInitialized();
    expect(validity._tag).toBe("NotInitialized");
  });

  it("creates Invalid variant with error", () => {
    const validity = InitValidity.Invalid("Invalid JSON structure");
    expect(validity._tag).toBe("Invalid");
    if (validity._tag === "Invalid") {
      expect(validity.error).toBe("Invalid JSON structure");
    }
  });
});

describe("InitValidity type narrowing", () => {
  it("allows exhaustive switch on _tag", () => {
    const getDescription = (validity: InitValidity): string => {
      switch (validity._tag) {
        case "Valid":
          return `Workspace initialized with scope: ${validity.settings.scope ?? "default"}`;
        case "NotInitialized":
          return "No settings.json found";
        case "Invalid":
          return `Invalid settings: ${validity.error}`;
      }
    };

    const settings: Settings = { scope: "@community" };
    expect(getDescription(InitValidity.Valid(settings))).toBe(
      "Workspace initialized with scope: @community",
    );
    expect(getDescription(InitValidity.NotInitialized())).toBe("No settings.json found");
    expect(getDescription(InitValidity.Invalid("parse error"))).toBe(
      "Invalid settings: parse error",
    );
  });
});

describe("ActualInitState", () => {
  it("represents an uninitialized workspace", () => {
    const state: ActualInitState = {
      validity: InitValidity.NotInitialized(),
    };

    expect(state.validity._tag).toBe("NotInitialized");
  });

  it("represents a valid initialized workspace", () => {
    const settings: Settings = {
      scope: "@community",
      agents: ["claude-code", "cursor"],
    };
    const state: ActualInitState = {
      validity: InitValidity.Valid(settings),
    };

    expect(state.validity._tag).toBe("Valid");
    if (state.validity._tag === "Valid") {
      expect(state.validity.settings.scope).toBe("@community");
      expect(state.validity.settings.agents).toEqual(["claude-code", "cursor"]);
    }
  });

  it("represents an invalid workspace with schema errors", () => {
    const state: ActualInitState = {
      validity: InitValidity.Invalid("Invalid JSON structure"),
    };

    expect(state.validity._tag).toBe("Invalid");
    if (state.validity._tag === "Invalid") {
      expect(state.validity.error).toContain("Invalid JSON structure");
    }
  });
});

describe("IdealInitState", () => {
  const makeAgent = (id: string): AgentConfig => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    detectPath: `~/.${id}`,
  });

  it("represents desired workspace configuration", () => {
    const ideal: IdealInitState = {
      agents: [makeAgent("claude-code"), makeAgent("cursor")],
      scope: "@community",
    };

    expect(ideal.agents.length).toBe(2);
    expect(ideal.agents[0]?.id).toBe("claude-code");
    expect(ideal.scope).toBe("@community");
  });

  it("supports empty agents list", () => {
    const ideal: IdealInitState = {
      agents: [],
      scope: "@community",
    };

    expect(ideal.agents).toEqual([]);
  });

  it("supports custom scope", () => {
    const ideal: IdealInitState = {
      agents: [makeAgent("claude-code")],
      scope: "@myorg",
    };

    expect(ideal.scope).toBe("@myorg");
  });
});

describe("InitChange constructors", () => {
  const makeAgent = (id: string): AgentConfig => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    detectPath: `~/.${id}`,
  });

  const makeIdealState = (): IdealInitState => ({
    agents: [makeAgent("claude-code")],
    scope: "@community",
  });

  const makeSettings = (): Settings => ({
    scope: "@community",
    agents: ["claude-code"],
  });

  it("creates Add change for new workspace", () => {
    const change = InitChange.Add(makeIdealState());
    expect(change._tag).toBe("Add");
    if (change._tag === "Add") {
      expect(change.ideal.agents.length).toBe(1);
    }
  });

  it("creates Update change for re-initialization", () => {
    const from = makeSettings();
    const to = makeIdealState();
    const change = InitChange.Update(from, to);
    expect(change._tag).toBe("Update");
    if (change._tag === "Update") {
      expect(change.from.scope).toBe("@community");
      expect(change.to.scope).toBe("@community");
    }
  });

  it("creates Unchanged change for already-initialized workspace", () => {
    const settings = makeSettings();
    const change = InitChange.Unchanged(settings);
    expect(change._tag).toBe("Unchanged");
    if (change._tag === "Unchanged") {
      expect(change.settings.scope).toBe("@community");
    }
  });
});

describe("InitChange type narrowing", () => {
  const makeAgent = (id: string): AgentConfig => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    detectPath: `~/.${id}`,
  });

  it("allows exhaustive switch on _tag", () => {
    const describeChange = (change: InitChange): string => {
      switch (change._tag) {
        case "Add":
          return `Creating new workspace with ${change.ideal.agents.length} agents`;
        case "Update":
          return `Updating existing workspace`;
        case "Unchanged":
          return `Workspace unchanged`;
      }
    };

    const ideal: IdealInitState = {
      agents: [makeAgent("claude-code"), makeAgent("cursor")],
      scope: "@community",
    };
    const settings: Settings = { scope: "@community", agents: [] };

    expect(describeChange(InitChange.Add(ideal))).toBe("Creating new workspace with 2 agents");
    expect(describeChange(InitChange.Update(settings, ideal))).toBe("Updating existing workspace");
    expect(describeChange(InitChange.Unchanged(settings))).toBe("Workspace unchanged");
  });
});

describe("InitDiff", () => {
  const makeAgent = (id: string): AgentConfig => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    detectPath: `~/.${id}`,
  });

  it("represents a diff with Add change", () => {
    const ideal: IdealInitState = {
      agents: [makeAgent("claude-code")],
      scope: "@community",
    };
    const diff: InitDiff = {
      change: InitChange.Add(ideal),
    };

    expect(diff.change._tag).toBe("Add");
  });

  it("represents a diff with Update change", () => {
    const settings: Settings = { scope: "@community", agents: [] };
    const ideal: IdealInitState = {
      agents: [makeAgent("claude-code")],
      scope: "@community",
    };
    const diff: InitDiff = {
      change: InitChange.Update(settings, ideal),
    };

    expect(diff.change._tag).toBe("Update");
  });

  it("represents a diff with Unchanged", () => {
    const settings: Settings = { scope: "@community", agents: ["claude-code"] };
    const diff: InitDiff = {
      change: InitChange.Unchanged(settings),
    };

    expect(diff.change._tag).toBe("Unchanged");
  });
});

describe("hasInitChanges", () => {
  const makeAgent = (id: string): AgentConfig => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    detectPath: `~/.${id}`,
  });

  it("returns true for Add change", () => {
    const diff: InitDiff = {
      change: InitChange.Add({
        agents: [makeAgent("claude-code")],
        scope: "@community",
      }),
    };
    expect(hasInitChanges(diff)).toBe(true);
  });

  it("returns true for Update change", () => {
    const diff: InitDiff = {
      change: InitChange.Update(
        { scope: "@old" },
        { agents: [makeAgent("claude-code")], scope: "@community" },
      ),
    };
    expect(hasInitChanges(diff)).toBe(true);
  });

  it("returns false for Unchanged", () => {
    const diff: InitDiff = {
      change: InitChange.Unchanged({ scope: "@community", agents: ["claude-code"] }),
    };
    expect(hasInitChanges(diff)).toBe(false);
  });
});
