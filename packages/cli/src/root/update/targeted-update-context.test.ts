import { describe, expect, it } from "vitest";

import type {
  ConfiguredRecordRow,
  DesiredExtensionNode,
  DesiredStateGraph,
} from "@agentxm/client-core/unstable/workspace";

import { classifyTargetedUpdate } from "./targeted-update-context.js";

const target = {
  type: "skill" as const,
  name: "review",
  fqn: "@acme/skills/review",
};

const configuredPack = (name: string, source: string): ConfiguredRecordRow => ({
  type: "pack",
  name,
  source,
  enabled: true,
  packagingKind: "native",
  lifecycle: "configured",
});

const graph = (
  nodes: ReadonlyArray<DesiredExtensionNode>,
  problems: DesiredStateGraph["problems"] = [],
): DesiredStateGraph => ({ complete: problems.length === 0, nodes, problems });

type DesiredOrigin = DesiredExtensionNode["origins"][number];
type TestOrigin =
  DesiredOrigin | Omit<Extract<DesiredOrigin, { readonly type: "pack" }>, "manifestPath">;

const node = (origins: ReadonlyArray<TestOrigin>): DesiredExtensionNode => ({
  type: "skill",
  name: "review",
  identity: target.fqn,
  source: origins[0]?.source ?? target.fqn,
  enabled: origins.some((origin) => origin.enabled),
  constraints: origins.flatMap((origin) =>
    origin.constraint === undefined ? [] : [origin.constraint],
  ),
  origins: origins.map((origin) =>
    origin.type === "pack" && !("manifestPath" in origin)
      ? {
          ...origin,
          manifestPath: `/workspace/agent_extensions/${origin.pack}/pack.json`,
        }
      : origin,
  ),
});

describe("classifyTargetedUpdate", () => {
  it("blocks a target with no desired origin", () => {
    const context = classifyTargetedUpdate({ target, graph: graph([]), configuredPacks: [] });

    expect(context.public).toMatchObject({
      ownership: "absent",
      activation: "disabled",
      authority: "blocked",
      blocker: "not-desired",
    });
  });

  it("classifies direct-only ownership and preserves its durable constraint", () => {
    const context = classifyTargetedUpdate({
      target,
      graph: graph([
        node([
          {
            type: "settings",
            source: "@acme/skills/review@^1.0.0",
            enabled: true,
            constraint: "^1.0.0",
          },
        ]),
      ]),
      configuredPacks: [],
    });

    expect(context.public).toMatchObject({
      ownership: "direct-only",
      activation: "enabled",
      authority: "direct",
      effectiveConstraint: ">=1.0.0 <2.0.0-0",
      direct: { source: "registry", enabled: true, constraint: "^1.0.0" },
      effects: { settings: "unchanged", acceptedResolution: "may-update" },
    });
  });

  it("classifies one pack as member-scoped pack authority", () => {
    const context = classifyTargetedUpdate({
      target,
      graph: graph([
        node([
          {
            type: "pack",
            pack: "@acme/packs/toolkit",
            source: target.fqn,
            constraint: "^1.0.0",
            enabled: true,
          },
        ]),
      ]),
      configuredPacks: [configuredPack("toolkit", "workspace")],
      configuredOwner: "@acme",
    });

    expect(context.public).toMatchObject({
      ownership: "pack-only",
      activation: "enabled",
      authority: "pack-aware",
      packs: [
        {
          fqn: "@acme/packs/toolkit",
          configuredName: "toolkit",
          constraint: "^1.0.0",
        },
      ],
      memberClosure: [target],
      effects: { settings: "unchanged", packManifest: "unchanged" },
    });
  });

  it("intersects multiple owning pack constraints", () => {
    const context = classifyTargetedUpdate({
      target,
      graph: graph([
        node([
          {
            type: "pack",
            pack: "@acme/packs/toolkit",
            source: target.fqn,
            constraint: "^1.0.0",
            enabled: true,
          },
          {
            type: "pack",
            pack: "@acme/packs/reviewers",
            source: target.fqn,
            constraint: ">=1.4.0 <1.8.0",
            enabled: true,
          },
        ]),
      ]),
      configuredPacks: [
        configuredPack("toolkit", "workspace"),
        configuredPack("reviewers", "workspace"),
      ],
    });

    expect(context.public.effectiveConstraint).toBe(">=1.4.0 <1.8.0 >=1.0.0 <2.0.0-0");
    expect(context.public.packs.map((pack) => pack.fqn)).toEqual([
      "@acme/packs/reviewers",
      "@acme/packs/toolkit",
    ]);
  });

  it("uses direct authority with pack guards for combined ownership", () => {
    const context = classifyTargetedUpdate({
      target,
      explicitRange: "^1.5.0",
      graph: graph([
        node([
          {
            type: "settings",
            source: "@acme/skills/review@^1.0.0",
            enabled: true,
            constraint: "^1.0.0",
          },
          {
            type: "pack",
            pack: "@acme/packs/toolkit",
            source: target.fqn,
            constraint: "<1.9.0",
            enabled: true,
          },
        ]),
      ]),
      configuredPacks: [configuredPack("toolkit", "workspace")],
    });

    expect(context.public).toMatchObject({
      ownership: "combined",
      authority: "direct",
      effectiveConstraint: ">=1.5.0 <2.0.0-0 <1.9.0",
      effects: { settings: "may-update", packManifest: "unchanged" },
    });
  });

  it("blocks an effectively disabled target", () => {
    const disabled = node([
      { type: "settings", source: target.fqn, enabled: false },
      {
        type: "pack",
        pack: "@acme/packs/toolkit",
        source: target.fqn,
        constraint: "^1.0.0",
        enabled: true,
      },
    ]);
    const context = classifyTargetedUpdate({
      target,
      graph: graph([{ ...disabled, enabled: false }]),
      configuredPacks: [],
    });

    expect(context.public.blocker).toBe("disabled");
  });

  it("blocks an explicit range on a pack-only target", () => {
    const context = classifyTargetedUpdate({
      target,
      explicitRange: "^2.0.0",
      graph: graph([
        node([
          {
            type: "pack",
            pack: "@acme/packs/toolkit",
            source: target.fqn,
            constraint: "^1.0.0",
            enabled: true,
          },
        ]),
      ]),
      configuredPacks: [],
    });

    expect(context.public.blocker).toBe("pack-owned-constraint");
  });

  it("blocks a pack member whose source authority is workspace-authored", () => {
    const context = classifyTargetedUpdate({
      target,
      graph: graph([
        node([
          {
            type: "pack",
            pack: "@acme/packs/toolkit",
            source: "workspace",
            constraint: "^1.0.0",
            enabled: true,
          },
        ]),
      ]),
      configuredPacks: [configuredPack("toolkit", "workspace")],
      configuredOwner: "@acme",
    });

    expect(context.public).toMatchObject({
      authority: "blocked",
      blocker: "source-authority",
      packs: [{ memberSource: "workspace" }],
    });
  });

  it("treats unreadable configured pack membership as globally relevant", () => {
    const context = classifyTargetedUpdate({
      target,
      graph: graph(
        [],
        [
          {
            type: "pack-manifest-unavailable",
            pack: "@acme/packs/toolkit",
            path: "/secret/workspace/pack.json",
          },
        ],
      ),
      configuredPacks: [],
    });

    expect(context.public.blocker).toBe("incomplete-graph");
    expect(JSON.stringify(context.public)).not.toContain("/secret/workspace");
  });

  it("blocks an empty direct-and-pack constraint intersection", () => {
    const context = classifyTargetedUpdate({
      target,
      graph: graph([
        node([
          {
            type: "settings",
            source: "@acme/skills/review@^1.0.0",
            enabled: true,
            constraint: "^1.0.0",
          },
          {
            type: "pack",
            pack: "@acme/packs/toolkit",
            source: target.fqn,
            constraint: "^2.0.0",
            enabled: true,
          },
        ]),
      ]),
      configuredPacks: [],
    });

    expect(context.public.blocker).toBe("constraint-conflict");
  });
});
