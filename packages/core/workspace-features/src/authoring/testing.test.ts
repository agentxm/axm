import { describe, expect, it } from "vitest";

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { manifestSchemaForType } from "@agentxm/extension-content";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";

import type { CreatableExtensionType } from "./create/create-extension.js";
import { hookScaffold } from "./create/scaffolds/hook.js";
import { knowledgeScaffold } from "./create/scaffolds/knowledge.js";
import { mcpServerScaffold } from "./create/scaffolds/mcp-server.js";
import { packScaffold } from "./create/scaffolds/pack.js";
import { ruleScaffold } from "./create/scaffolds/rule.js";
import type { AuthoredScaffold } from "./create/scaffolds/scaffold.js";
import { skillScaffold } from "./create/scaffolds/skill.js";
import { subagentScaffold } from "./create/scaffolds/subagent.js";
import {
  CREATABLE_TYPES,
  createRequestFor,
  makeAuthoringWorkspace,
  minimalPackageFiles,
} from "./testing.js";

describe("./testing.js", () => {
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

  it("gives every minimal package the manifest and entry document its scaffold creates", () => {
    const name = "review";
    const owner = decodeHandleSync("@acme");
    const scaffolds = {
      skill: skillScaffold({ name, owner }),
      "mcp-server": mcpServerScaffold({ name, owner, description: "" }),
      subagent: subagentScaffold({ name, owner }),
      rule: ruleScaffold({ name, owner, title: Option.none() }),
      hook: hookScaffold({
        name,
        owner,
        runtime: "bash",
        protocol: "claude-code",
        event: "PreToolUse",
        matcher: Option.none(),
      }),
      knowledge: knowledgeScaffold({ name, owner, description: Option.none() }),
      pack: packScaffold({ name, owner }),
    } satisfies Record<CreatableExtensionType, AuthoredScaffold>;
    for (const type of CREATABLE_TYPES) {
      const files = minimalPackageFiles(type, { name });
      const manifestFile = manifestFilenameForType(type);
      // The scaffold decides where the manifest and the document an author
      // edits next live; a minimal package holds exactly those files.
      expect(Object.keys(files).sort()).toEqual(
        [...new Set([manifestFile, scaffolds[type].entryFile])].sort(),
      );
      const manifest: unknown = JSON.parse(files[manifestFile] ?? "");
      expect(() => Schema.decodeUnknownSync(manifestSchemaForType(type))(manifest)).not.toThrow();
    }
  });
});
