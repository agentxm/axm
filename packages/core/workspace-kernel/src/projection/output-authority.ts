/** Exact native ownership facts derived from the selected workspace's authority. */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { type HookNativeDeclaration } from "../agent-adapters/index.js";
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
  readonly expectedHooks: ReadonlyArray<HookNativeDeclaration>;
  readonly expectedRegions: Readonly<
    Record<"rule" | "knowledge", ReadonlyArray<NativeRegionSource>>
  >;
  readonly declaredMcpNames: ReadonlySet<string>;
  readonly expectedSkillSources: Readonly<Record<string, ReadonlyArray<string>>>;
  /** Subagent names the workspace declares; a native file of that name at a planned container is AXM's. */
  readonly expectedSubagentNames: ReadonlySet<string>;
}

/** A path's location beneath a store is never, by itself, ownership evidence. */
interface OutputAuthorityInputs {
  readonly path: Path.Path;
  readonly baseDir: string;
  readonly layout: WorkspaceLayout;
  readonly acceptedResolutions: Lockfile;
  readonly desired: Pick<DesiredStateGraph, "nodes">;
  readonly settings: Settings;
}

export const deriveAgentOutputAuthority = (args: OutputAuthorityInputs): AgentOutputAuthority => {
  const expectedSubagentNames = new Set<string>();
  const declaredMcpNames = new Set<string>();
  const expectedHooks: HookNativeDeclaration[] = [];
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
    const root = args.path.resolve(args.baseDir, source);
    if (
      !expectedHooks.some((hook) => hook.name === name && hook.ref === ref && hook.root === root)
    ) {
      expectedHooks.push({ name, ref, root, scope: args.layout.scope });
    }
  };
  for (const name of Object.keys(args.acceptedResolutions.subagents ?? {}))
    expectedSubagentNames.add(name);
  for (const [name, entry] of Object.entries(args.acceptedResolutions.hooks ?? {})) {
    if (!args.desired.nodes.some((node) => node.type === "hook" && node.name === name)) continue;
    const paths = computeExtensionPathsForLayout(
      args.path.join,
      args.layout,
      extensionPathSourceFromLockEntry(entry),
      "hooks",
      entry.identity.name,
    );
    addHook(name, `${entry.identity.owner}/hooks/${entry.identity.name}`, paths.canonicalPath);
  }
  for (const [name, entry] of Object.entries(args.settings.subagents ?? {})) {
    if (entry.source === "workspace" && args.layout.scope === "project")
      expectedSubagentNames.add(name);
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
    if (node.type === "mcp-server") declaredMcpNames.add(node.name);
    if (
      node.type === "subagent" &&
      node.identity.authority === "workspace" &&
      args.layout.scope === "project"
    )
      expectedSubagentNames.add(node.name);
  }
  return {
    expectedSkillSources: deriveSkillOutputSources(args),
    expectedSubagentNames,
    declaredMcpNames,
    expectedHooks,
    expectedRegions,
  };
};

/** Derive only skill ownership; a selected name never enumerates other accepted rows. */
export const deriveSkillOutputSources = (
  args: Pick<
    OutputAuthorityInputs,
    "path" | "layout" | "acceptedResolutions" | "settings" | "desired"
  >,
  selectedName?: string,
): Readonly<Record<string, ReadonlyArray<string>>> => {
  const skillSources: Record<string, string[]> = {};
  const addSkill = (name: string, source: string) => {
    const sources = skillSources[name] ?? [];
    if (!sources.includes(source)) sources.push(source);
    skillSources[name] = sources;
  };
  const accepted = args.acceptedResolutions.skills;
  const configured = args.settings.skills ?? {};
  const acceptedEntries =
    selectedName === undefined
      ? Object.entries(accepted)
      : accepted[selectedName] === undefined
        ? []
        : [[selectedName, accepted[selectedName]] as const];
  const configuredEntries =
    selectedName === undefined
      ? Object.entries(configured)
      : configured[selectedName] === undefined
        ? []
        : [[selectedName, configured[selectedName]] as const];
  for (const [name, entry] of acceptedEntries) {
    const paths = computeExtensionPathsForLayout(
      args.path.join,
      args.layout,
      extensionPathSourceFromLockEntry(entry),
      "skills",
      entry.identity.name,
    );
    addSkill(name, paths.extensionSrcPath);
  }
  for (const [name, entry] of configuredEntries) {
    if (entry.origin === "bundled") {
      addSkill(
        name,
        args.path.join(bundledSkillCanonicalRoot(args.path.join, args.layout, name), "src"),
      );
    } else if (entry.source === "workspace" && args.layout.scope === "project") {
      addSkill(name, args.path.join(args.layout.authoredRoot("skill"), name, "src"));
    }
  }
  for (const node of args.desired.nodes) {
    if (node.type !== "skill" || (selectedName !== undefined && node.name !== selectedName))
      continue;
    if (node.identity.authority === "bundled") {
      addSkill(
        node.name,
        args.path.join(bundledSkillCanonicalRoot(args.path.join, args.layout, node.name), "src"),
      );
    } else if (node.identity.authority === "workspace" && args.layout.scope === "project") {
      addSkill(node.name, args.path.join(args.layout.authoredRoot("skill"), node.name, "src"));
    }
  }
  return skillSources;
};

export const captureSkillOutputSources = (name: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const layout = yield* Ref.get(location.layout);
    const evaluation = yield* (yield* DesiredStateReader).evaluate();
    return (
      deriveSkillOutputSources(
        {
          path,
          layout,
          acceptedResolutions: evaluation.inputs.acceptedResolutions,
          desired: evaluation.graph,
          settings: evaluation.inputs.settings,
        },
        name,
      )[name] ?? []
    );
  });

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
