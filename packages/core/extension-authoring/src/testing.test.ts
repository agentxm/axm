import { describe, expect, it } from "vitest";

import * as Option from "effect/Option";

import { CREATABLE_TYPES, createRequestFor, makeAuthoringWorkspace } from "./testing.js";

describe("@agentxm/extension-authoring/testing", () => {
  it("initializes a workspace and snapshots it byte-exactly", () => {
    const workspace = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    try {
      expect(workspace.settings()).toEqual({ owner: "@acme", agents: ["claude-code"] });
      expect(workspace.tree()).toEqual(["axm.json"]);
      expect(workspace.lockfileText()).toBe("");

      const before = workspace.snapshot();
      workspace.write("skills/review/src/SKILL.md", "# Review\n");
      const after = workspace.snapshot();
      // A single added byte changes the snapshot, which is what makes it
      // usable as the evidence a preview wrote nothing.
      expect(after).not.toEqual(before);
      expect(after["skills/review/src/SKILL.md"]).toBe(
        `file:${Buffer.from("# Review\n").toString("base64")}`,
      );
      expect(after["skills"]).toBe("directory");
      expect(workspace.read("skills/review/src/SKILL.md")).toBe("# Review\n");
      expect(workspace.exists("skills/review")).toBe(true);
    } finally {
      workspace.cleanup();
    }
    expect(makeAuthoringWorkspace().settings()).toEqual({ agents: [] });
  });

  it("builds an admissible creation request for every creatable type", () => {
    for (const type of CREATABLE_TYPES) {
      const request = createRequestFor(type, "review");
      expect(request.type).toBe(type);
      expect(request.name).toBe("review");
      expect(Option.isNone(request.owner)).toBe(true);
    }
    expect(Option.getOrThrow(createRequestFor("skill", "review", Option.some("@acme")).owner)).toBe(
      "@acme",
    );
  });
});
