/**
 * The manager registry composed from the seven individual manager tags.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ExtensionManagers, type ExtensionManagersService } from "./manager-registry.js";
import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  PackManager,
  RuleManager,
  SkillManager,
  SubagentManager,
} from "./managers.js";

/** Resolve every per-type manager once and publish them as one lookup. */
export const ExtensionManagersLive: Layer.Layer<
  ExtensionManagers,
  never,
  | SkillManager
  | SubagentManager
  | RuleManager
  | HookManager
  | KnowledgeManager
  | McpServerManager
  | PackManager
> = Layer.effect(
  ExtensionManagers,
  Effect.gen(function* () {
    const managers: ExtensionManagersService = {
      skill: yield* SkillManager,
      subagent: yield* SubagentManager,
      rule: yield* RuleManager,
      hook: yield* HookManager,
      knowledge: yield* KnowledgeManager,
      "mcp-server": yield* McpServerManager,
      pack: yield* PackManager,
    };
    return managers;
  }),
);
