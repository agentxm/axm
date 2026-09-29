/**
 * Descriptor-to-adapter mapping for coding agents.
 *
 * Turns one catalog `AgentDescriptor` into the `CodingAgent` adapter that
 * knows that agent's native surfaces. Which agents a workspace projects onto
 * is a core decision made elsewhere.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import {
  resolveDeclaredNativeLocations,
  type NativeDirectoryInputs,
} from "../../locations/index.js";
import { type CodingAgent } from "./coding-agent.js";
import { addSubagentViaResolve, removeSubagentViaResolve } from "../subagents/sync.js";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type {
  AgentDescriptor,
  MaterializationTargetId,
} from "@agentxm/extension-model/unstable/agents/types";

/** @experimental This API is unstable and may change without notice. */
export const codingAgentFromDescriptor = (
  descriptor: AgentDescriptor,
  inputs: NativeDirectoryInputs = { skillsDirectoryOverrides: {} },
): CodingAgent => {
  const agent: CodingAgent = {
    id: descriptor.id,
    resolveNativeReadLocations: (args) =>
      Effect.map(Path.Path, (path) =>
        resolveDeclaredNativeLocations(path, descriptor, args.kind, args, inputs),
      ),
    resolveEffectiveSkillsDir: (args) =>
      Effect.gen(function* () {
        if (descriptor.skills === undefined || !descriptor.skills.scopes.includes(args.scope))
          return {
            _tag: "unsupported",
            reason: `Skills are not supported in ${args.scope} scope for ${descriptor.id}`,
          } as const;
        if (!descriptor.skills.writerSupported)
          return {
            _tag: "unsupported",
            reason: `AXM has no verified Skill writer for ${descriptor.id}`,
          } as const;
        const override = inputs.skillsDirectoryOverrides[descriptor.id];
        if (override !== undefined && override.trim().length === 0)
          return {
            _tag: "misconfigured",
            reason: `Skill directory override for ${descriptor.id} is empty`,
          } as const;
        const locations = yield* agent.resolveNativeReadLocations({ ...args, kind: "skill" });
        const primary = locations.find((location) => location.declaration.role === "primary");
        if (primary === undefined)
          return {
            _tag: "unverified",
            reason: `The ${args.scope} Skill location for ${descriptor.id} is unverified`,
          } as const;
        if (primary.declaration.shape !== "directory")
          return {
            _tag: "unsupported",
            reason: `AXM has no Skill writer for the declared ${primary.declaration.shape} location of ${descriptor.id}`,
          } as const;
        return { _tag: "supported", dir: primary.path } as const;
      }),
    resolveEffectiveSubagentsDir: (args) =>
      Effect.gen(function* () {
        if (descriptor.subagents === undefined || !descriptor.subagents.scopes.includes(args.scope))
          return {
            _tag: "unsupported",
            reason: `Subagents are not supported in ${args.scope} scope for ${descriptor.id}`,
          } as const;
        if (!descriptor.subagents.writerSupported)
          return {
            _tag: "unsupported",
            reason: `AXM has no verified native Subagent writer for ${descriptor.id}`,
          } as const;
        const locations = yield* agent.resolveNativeReadLocations({ ...args, kind: "subagent" });
        const primary = locations.find((location) => location.declaration.role === "primary");
        return primary === undefined
          ? ({
              _tag: "unverified",
              reason: `The ${args.scope} Subagent location for ${descriptor.id} is unverified`,
            } as const)
          : ({ _tag: "supported", dir: primary.path, warnings: [] } as const);
      }),
    addSubagent: (args) => addSubagentViaResolve(agent.resolveEffectiveSubagentsDir(args), args),
    removeSubagent: (args) =>
      removeSubagentViaResolve(agent.resolveEffectiveSubagentsDir(args), args),
  };
  return agent;
};

/** @experimental This API is unstable and may change without notice. */
export const codingAgentForId = (
  id: MaterializationTargetId,
  inputs: NativeDirectoryInputs = { skillsDirectoryOverrides: {} },
): CodingAgent => codingAgentFromDescriptor(AGENT_DESCRIPTORS[id], inputs);
