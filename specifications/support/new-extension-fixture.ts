import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  extensionName,
  handleHooksNew,
  handleKnowledgeNew,
  handleMcpServersNew,
  handlePacksNew,
  handleRulesNew,
  handleSkillsNew,
  handleSubagentsNew,
} from "axm.sh/specification-harness";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import type { AuthoringType } from "./authoring-fixtures.js";

export const createNewExtension = (
  row: AuthoringType,
  name: string,
  owner: Option.Option<string> = Option.none(),
) =>
  Effect.gen(function* () {
    const args = { name: extensionName(name), owner, preview: false };
    switch (row.type) {
      case "skill":
        return yield* handleSkillsNew(args);
      case "subagent":
        return yield* handleSubagentsNew(args);
      case "mcp-server":
        return yield* handleMcpServersNew({ ...args, description: "Workspace server" });
      case "rule":
        return yield* handleRulesNew({ ...args, title: Option.some("Review policy") });
      case "hook":
        return yield* handleHooksNew({
          ...args,
          runtime: "bash",
          event: "tool.pre",
          matcher: Option.none(),
        });
      case "knowledge":
        return yield* handleKnowledgeNew({
          ...args,
          description: Option.some("Workspace handbook"),
        });
      case "pack":
        return yield* handlePacksNew({
          ...args,
          owner: Option.map(owner, (value) =>
            normalizeHandle(value.startsWith("@") ? value : `@${value}`),
          ),
        });
    }
  });
