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
import { minimalPackageFiles } from "./testing.js";

const CREATABLE_TYPES = [
  "skill",
  "mcp-server",
  "subagent",
  "rule",
  "hook",
  "knowledge",
  "pack",
] as const satisfies ReadonlyArray<CreatableExtensionType>;

describe("./testing.js", () => {
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
