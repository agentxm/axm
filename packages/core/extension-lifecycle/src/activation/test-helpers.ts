/**
 * Driving the activation use case from this package's own tests and
 * specifications, over a workspace that holds one authored extension of the
 * requested type in the requested activation state.
 *
 * Every seeded extension is workspace-authored so that activation is exercised
 * without a source fetch: enabling something the workspace already holds is
 * exactly what activation means, and a fixture that reached the network would
 * be describing installation instead.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";

import { makeLifecycleFixture, type LifecycleFixture } from "../testing.js";
import {
  SetActivation,
  type ActivationUnchanged,
  type SetActivationCandidate,
  type SetActivationRequest,
} from "./set-activation.js";

/** Where an authored extension of each type lives, and how it is declared. */
const LAYOUT = {
  skill: { plural: "skills", manifest: "skill.json", settingsKey: "skills" },
  subagent: { plural: "subagents", manifest: "subagent.json", settingsKey: "subagents" },
  "mcp-server": { plural: "mcps", manifest: "mcp.json", settingsKey: "mcpServers" },
  rule: { plural: "rules", manifest: "rule.json", settingsKey: "rules" },
  hook: { plural: "hooks", manifest: "hook.json", settingsKey: "hooks" },
  knowledge: { plural: "knowledge", manifest: "knowledge.json", settingsKey: "knowledge" },
  pack: { plural: "packs", manifest: "pack.json", settingsKey: "packs" },
} as const satisfies Record<
  ExtensionType,
  { readonly plural: string; readonly manifest: string; readonly settingsKey: string }
>;

const manifestFor = (type: ExtensionType, name: string): Readonly<Record<string, unknown>> => {
  const base = { owner: "@acme", type, name, version: "1.0.0" };
  switch (type) {
    case "hook":
      return {
        ...base,
        description: `The ${name} hook.`,
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "tool.pre", match: { tools: ["file.write"] } }],
      };
    case "knowledge":
      return { ...base, format: { name: "okf", version: "0.2" }, bundleRoot: "src" };
    case "mcp-server":
      return {
        ...base,
        server: {
          name: `io.github.acme/${name}`,
          description: `The ${name} MCP server.`,
          version: "1.0.0",
          packages: [
            {
              registryType: "npm",
              identifier: `@acme/${name}-mcp`,
              version: "1.0.0",
              transport: { type: "stdio" },
            },
          ],
        },
      };
    case "pack":
      return { ...base, description: `The ${name} pack.`, dependencies: {} };
    default:
      return { ...base, description: `The ${name} ${type}.` };
  }
};

const contentFor = (
  type: ExtensionType,
  name: string,
): ReadonlyArray<readonly [string, string]> => {
  switch (type) {
    case "skill":
      return [
        ["src/SKILL.md", `---\nname: ${name}\ndescription: The ${name} skill.\n---\n\n# ${name}\n`],
      ];
    case "subagent":
      return [
        [
          `src/${name}.md`,
          `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n# ${name}\n`,
        ],
      ];
    case "rule":
      return [["src/RULE.md", `Guidance for ${name}.\n`]];
    case "hook":
      return [["src/hook.sh", `#!/usr/bin/env bash\necho "${name}"\n`]];
    case "knowledge":
      return [
        [
          "src/index.md",
          `---\nokf_version: "0.2"\ndescription: "The ${name} bundle."\n---\n\n# ${name}\n`,
        ],
      ];
    case "mcp-server":
    case "pack":
      return [];
  }
};

/** The settings value that declares a workspace-authored entry's activation. */
const settingsEntry = (enabled: boolean) => ({ source: "workspace", enabled });

/**
 * A workspace holding one authored extension of `type`, declared with the
 * given activation state and materialized for one configured agent.
 */
export const workspaceWithAuthoredExtension = (args: {
  readonly type: ExtensionType;
  readonly name: string;
  readonly enabled: boolean;
}): LifecycleFixture => {
  const layout = LAYOUT[args.type];
  const fixture = makeLifecycleFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      [layout.settingsKey]: { [args.name]: settingsEntry(args.enabled) },
    },
  });
  const packageRoot = nodePath.join(fixture.root, layout.plural, args.name);
  fs.mkdirSync(nodePath.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(packageRoot, layout.manifest),
    `${JSON.stringify(manifestFor(args.type, args.name), null, 2)}\n`,
  );
  for (const [relative, contents] of contentFor(args.type, args.name)) {
    const file = nodePath.join(packageRoot, relative);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return fixture;
};

/**
 * A workspace with a configured agent and no extension of any type, so a
 * request can name a subject the workspace does not hold.
 */
export const workspaceWithoutExtensions = (): LifecycleFixture =>
  makeLifecycleFixture({ settings: { owner: "@acme", agents: ["claude-code"] } });

const run = (request: SetActivationRequest, mode: "apply" | "preview") =>
  Effect.gen(function* () {
    const candidate = yield* SetActivation.prepare(request);
    if (candidate._tag === "Unchanged") return candidate;
    const resolution = yield* SetActivation.previewOrApply(
      candidate,
      mode === "apply" ? preapprovedPlanExecution : previewPlanExecution,
    );
    return {
      _tag: "Resolved" as const,
      candidate,
      resolution,
      outcome: deriveOperationOutcome(resolution),
    };
  });

export const previewActivation = (request: SetActivationRequest) => run(request, "preview");

export const applyActivation = (request: SetActivationRequest) => run(request, "apply");

export type ActivationRunOutcome =
  | ActivationUnchanged
  | {
      readonly _tag: "Resolved";
      readonly candidate: SetActivationCandidate;
      readonly resolution: Effect.Success<ReturnType<typeof SetActivation.previewOrApply>>;
      readonly outcome: ReturnType<typeof deriveOperationOutcome>;
    };
