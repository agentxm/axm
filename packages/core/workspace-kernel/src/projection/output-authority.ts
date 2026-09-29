/** Exact native ownership facts derived from the selected workspace's authority. */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  buildAxmMcpMetadata,
  buildAxmMcpMetadataFromSettingsSource,
  type AxmMcpMetadata,
  type HookOwnership,
} from "../agent-adapters/index.js";
import type { NativeRegionSource } from "./native-managed-region.js";
import {
  bundledSkillCanonicalRoot,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  DesiredStateReader,
  WorkspaceLocation,
  type DesiredStateGraph,
  type Lockfile,
  type Settings,
  type WorkspaceLayout,
} from "../workspace-state/index.js";

export interface AgentOutputAuthority {
  readonly expectedHooks: ReadonlyArray<HookOwnership>;
  readonly expectedRegions: Readonly<
    Record<"rule" | "knowledge", ReadonlyArray<NativeRegionSource>>
  >;
  readonly expectedMcpEntries: Readonly<Record<string, ReadonlyArray<AxmMcpMetadata>>>;
  readonly expectedSkillSources: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly expectedSubagentFiles: Readonly<
    Record<
      string,
      ReadonlyArray<{
        readonly ext: string;
        readonly src: string;
      }>
    >
  >;
}

/** A path's location beneath a store is never, by itself, ownership evidence. */
export const deriveAgentOutputAuthority = (args: {
  readonly path: Path.Path;
  readonly baseDir: string;
  readonly layout: WorkspaceLayout;
  readonly acceptedResolutions: Lockfile;
  readonly desired: Pick<DesiredStateGraph, "nodes">;
  readonly settings: Settings;
}): AgentOutputAuthority => {
  const skillSources: Record<string, string[]> = {};
  const subagentFiles: Record<string, Array<{ ext: string; src: string }>> = {};
  const mcpEntries: Record<string, AxmMcpMetadata[]> = {};
  const expectedHooks: HookOwnership[] = [];
  const expectedRegions: Record<"rule" | "knowledge", NativeRegionSource[]> = {
    rule: [],
    knowledge: [],
  };
  const addRegion = (type: "rule" | "knowledge", name: string, ref: string, source: string) => {
    const root = args.path.relative(args.baseDir, source);
    if (
      !expectedRegions[type].some(
        (owner) => owner.name === name && owner.ref === ref && owner.root === root,
      )
    )
      expectedRegions[type].push({ name, ref, root, scope: args.layout.scope });
  };
  for (const [name, entry] of Object.entries(args.acceptedResolutions.rules ?? {})) {
    const paths = computeExtensionPathsForLayout(
      args.path.join,
      args.layout,
      extensionPathSourceFromLockEntry(entry),
      "rules",
      entry.identity.name,
    );
    addRegion(
      "rule",
      name,
      `${entry.identity.owner}/rules/${entry.identity.name}`,
      paths.canonicalPath,
    );
  }
  for (const [name, entry] of Object.entries(args.acceptedResolutions.knowledge ?? {})) {
    const paths = computeExtensionPathsForLayout(
      args.path.join,
      args.layout,
      extensionPathSourceFromLockEntry(entry),
      "knowledge",
      entry.identity.name,
    );
    addRegion(
      "knowledge",
      name,
      `${entry.identity.owner}/knowledge/${entry.identity.name}`,
      paths.canonicalPath,
    );
  }
  const addHook = (name: string, ref: string, source: string) => {
    const root = args.path.relative(args.baseDir, source);
    if (
      !expectedHooks.some((hook) => hook.name === name && hook.ref === ref && hook.root === root)
    ) {
      expectedHooks.push({ name, ref, root, scope: args.layout.scope });
    }
  };
  const addSkill = (name: string, source: string) => {
    const sources = skillSources[name] ?? [];
    if (!sources.includes(source)) sources.push(source);
    skillSources[name] = sources;
  };
  const addSubagent = (name: string, ext: string, source: string) => {
    const src = args.path.relative(args.baseDir, args.path.join(source, `${name}.md`));
    const files = subagentFiles[name] ?? [];
    if (!files.some((file) => file.ext === ext && file.src === src)) files.push({ ext, src });
    subagentFiles[name] = files;
  };
  for (const [name, entry] of Object.entries(args.acceptedResolutions.skills)) {
    const paths = computeExtensionPathsForLayout(
      args.path.join,
      args.layout,
      extensionPathSourceFromLockEntry(entry),
      "skills",
      entry.identity.name,
    );
    addSkill(name, paths.extensionSrcPath);
  }
  for (const [name, entry] of Object.entries(args.acceptedResolutions.subagents ?? {})) {
    const paths = computeExtensionPathsForLayout(
      args.path.join,
      args.layout,
      extensionPathSourceFromLockEntry(entry),
      "subagents",
      entry.identity.name,
    );
    addSubagent(
      name,
      `${entry.identity.owner}/subagents/${entry.identity.name}`,
      paths.extensionSrcPath,
    );
  }
  for (const [name, entry] of Object.entries(args.acceptedResolutions.hooks ?? {})) {
    const paths = computeExtensionPathsForLayout(
      args.path.join,
      args.layout,
      extensionPathSourceFromLockEntry(entry),
      "hooks",
      entry.identity.name,
    );
    addHook(name, `${entry.identity.owner}/hooks/${entry.identity.name}`, paths.canonicalPath);
  }
  for (const [name, entry] of Object.entries(args.settings.hooks ?? {})) {
    if (
      entry.source === "workspace" &&
      args.layout.scope === "project" &&
      args.layout.owner !== undefined
    ) {
      addHook(
        name,
        `${args.layout.owner}/hooks/${name}`,
        args.path.join(args.layout.authoredRoot("hook"), name),
      );
    }
  }
  for (const [name, entry] of Object.entries(args.settings.skills ?? {})) {
    if (entry.origin === "bundled") {
      addSkill(
        name,
        args.path.join(bundledSkillCanonicalRoot(args.path.join, args.layout, name), "src"),
      );
    } else if (entry.source === "workspace" && args.layout.scope === "project") {
      addSkill(name, args.path.join(args.layout.authoredRoot("skill"), name, "src"));
    }
  }
  for (const [name, entry] of Object.entries(args.settings.subagents ?? {})) {
    if (
      entry.source === "workspace" &&
      args.layout.scope === "project" &&
      args.layout.owner !== undefined
    ) {
      addSubagent(
        name,
        `${args.layout.owner}/subagents/${name}`,
        args.path.join(args.layout.authoredRoot("subagent"), name, "src"),
      );
    }
  }
  for (const node of args.desired.nodes) {
    if (
      (node.type === "rule" || node.type === "knowledge") &&
      node.identity.authority === "workspace" &&
      args.layout.scope === "project"
    ) {
      addRegion(
        node.type,
        node.name,
        node.identity.fqn,
        args.path.join(args.layout.authoredRoot(node.type), node.name),
      );
    }
    if (
      node.type === "hook" &&
      node.identity.authority === "workspace" &&
      args.layout.scope === "project"
    ) {
      addHook(
        node.name,
        node.identity.fqn,
        args.path.join(args.layout.authoredRoot("hook"), node.name),
      );
    }
    if (node.type === "mcp-server") {
      const identity = node.identity;
      if (identity.authority === "inline") {
        mcpEntries[node.name] = [buildAxmMcpMetadataFromSettingsSource("inline", node.name)];
      } else if (identity.fqn !== undefined) {
        // Native sourced MCP metadata names the accepted manifest identity.
        mcpEntries[node.name] = [
          buildAxmMcpMetadata({ ext: identity.fqn, source: "registry", ref: identity.fqn }),
        ];
      }
    }
    if (node.type !== "skill" && node.type !== "subagent") continue;
    if (node.identity.authority === "bundled" && node.type === "skill") {
      addSkill(
        node.name,
        args.path.join(bundledSkillCanonicalRoot(args.path.join, args.layout, node.name), "src"),
      );
    }
    if (node.identity.authority !== "workspace" || args.layout.scope !== "project") continue;
    const source = args.path.join(args.layout.authoredRoot(node.type), node.name, "src");
    if (node.type === "skill") addSkill(node.name, source);
    else addSubagent(node.name, node.identity.fqn, source);
  }
  for (const [name, entry] of Object.entries(args.settings.mcpServers ?? {})) {
    if (entry.kind === "inline")
      mcpEntries[name] = [buildAxmMcpMetadataFromSettingsSource("inline", name)];
  }
  return {
    expectedSkillSources: skillSources,
    expectedSubagentFiles: subagentFiles,
    expectedMcpEntries: mcpEntries,
    expectedHooks,
    expectedRegions,
  };
};

/** Capture before publishing a transition; retirement keeps its original authority. */
export const captureAgentOutputAuthority = () =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const evaluation = yield* (yield* DesiredStateReader).evaluate();
    return deriveAgentOutputAuthority({
      path,
      baseDir: location.baseDir,
      layout,
      acceptedResolutions: evaluation.inputs.acceptedResolutions,
      desired: evaluation.graph,
      settings: evaluation.inputs.settings,
    });
  });
