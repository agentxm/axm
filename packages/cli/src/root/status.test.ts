import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { PacksLockMapSchema, SkillsLockMapSchema } from "@agentxm/client-core/unstable/lockfile";
import type { AxmSkillCompatibility } from "@agentxm/client-core/unstable/skills";
import type {
  CanonicalObservation,
  DesiredStateGraph,
  DesiredExtensionNode,
} from "@agentxm/client-core/unstable/workspace";
import {
  axmSkillCompatibilityProblem,
  canonicalHealthProblem,
  formatAxmSkillCompatibility,
  projectionIsCurrent,
  receiptOnlySkillProblems,
} from "./status.js";

const observation = {
  type: "skill",
  name: "draft-skill",
  status: "locally-modified",
  path: "/workspace/.axm/extensions/@test/skills/draft-skill",
  contentIdentity: "sha256-working",
} satisfies CanonicalObservation;

const incompatibleAxmSkill = {
  status: "incompatible",
  cliVersion: "1.2.3",
  skillVersion: "1.1.0",
  source: "@agentxm/skills/axm@1.1.0",
  declaredCliVersion: "1.1.0",
  declaredCliVersionRange: ">=1.1.0 <1.2.0",
  reasonCode: "cli-version-incompatible",
  detail: "AXM CLI 1.2.3 is outside the official AXM skill range >=1.1.0 <1.2.0.",
} satisfies AxmSkillCompatibility;

describe("AXM skill compatibility status", () => {
  it("turns incompatibility into a blocking workspace problem", () => {
    expect(axmSkillCompatibilityProblem(incompatibleAxmSkill, "project")).toEqual({
      code: "cli-version-incompatible",
      extensionType: "skill",
      identity: "@agentxm/skills/axm",
      detail: incompatibleAxmSkill.detail,
      blocking: true,
      recoveryAction: "axm skills install @agentxm/skills/axm --bundled --preview",
    });
  });

  it("preserves scope on the recovery command", () => {
    expect(axmSkillCompatibilityProblem(incompatibleAxmSkill, "user")).toMatchObject({
      recoveryAction: "axm skills install @agentxm/skills/axm --bundled --preview --scope user",
    });
  });

  it("formats a compact human summary with every available version fact", () => {
    expect(formatAxmSkillCompatibility(incompatibleAxmSkill)).toBe(
      "AXM skill compatibility: incompatible — cli-version-incompatible (CLI 1.2.3, skill 1.1.0, range >=1.1.0 <1.2.0, source @agentxm/skills/axm@1.1.0)",
    );
  });
});

describe("canonicalHealthProblem", () => {
  it("classifies workspace-authored modifications as publishable advisories", () => {
    const node = {
      type: "skill",
      name: "draft-skill",
      identity: "workspace:@test/skills/draft-skill",
      source: "workspace:@test/skills/draft-skill",
      enabled: true,
      constraints: [],
      origins: [],
    } satisfies DesiredExtensionNode;

    expect(canonicalHealthProblem(node, observation)).toEqual({
      code: "canonical-locally-modified",
      extensionType: "skill",
      identity: "@test/skills/draft-skill",
      detail:
        "Canonical content was modified since its last recorded authoring/publish baseline at /workspace/.axm/extensions/@test/skills/draft-skill. Publishing preserves the authored content.",
      blocking: false,
      recoveryAction: "axm publish @test/skills/draft-skill",
    });
  });

  it("keeps trusted-source modifications blocking and warns that sync discards them", () => {
    const node = {
      type: "skill",
      name: "draft-skill",
      identity: "@test/skills/draft-skill",
      source: "@test/skills/draft-skill@1.0.0",
      enabled: true,
      constraints: ["1.0.0"],
      origins: [],
    } satisfies DesiredExtensionNode;

    expect(canonicalHealthProblem(node, observation)).toEqual({
      code: "canonical-locally-modified",
      extensionType: "skill",
      identity: "@test/skills/draft-skill",
      detail:
        "Canonical content differs from its trusted source baseline at /workspace/.axm/extensions/@test/skills/draft-skill. Applying sync restores trusted source content and discards these local modifications.",
      blocking: true,
      recoveryAction: "axm sync @test/skills/draft-skill --preview",
    });
  });

  it("recommends publish for workspace-authored packs too", () => {
    const node = {
      type: "pack",
      name: "draft-pack",
      identity: "workspace:@test/packs/draft-pack",
      source: "workspace:@test/packs/draft-pack",
      enabled: true,
      constraints: [],
      origins: [],
    } satisfies DesiredExtensionNode;
    const packObservation = {
      ...observation,
      type: "pack",
      name: "draft-pack",
      path: "/workspace/.axm/extensions/@test/packs/draft-pack",
    } satisfies CanonicalObservation;

    expect(canonicalHealthProblem(node, packObservation)).toMatchObject({
      blocking: false,
      recoveryAction: "axm publish @test/packs/draft-pack",
    });
  });

  it("provides an explicit recovery command for a relocated workspace extension", () => {
    const node = {
      type: "skill",
      name: "draft-skill",
      identity: "workspace:@other/skills/draft-skill",
      source: "workspace:@other/skills/draft-skill",
      enabled: true,
      constraints: [],
      origins: [],
    } satisfies DesiredExtensionNode;

    expect(
      canonicalHealthProblem(node, {
        ...observation,
        status: "wrong-origin",
      }),
    ).toMatchObject({
      code: "canonical-wrong-origin",
      recoveryAction: "axm adopt @other/skills/draft-skill --preview",
    });
  });

  it("provides a distinct recovery command when trust is missing", () => {
    const node = {
      type: "skill",
      name: "draft-skill",
      identity: "workspace:@test/skills/draft-skill",
      source: "workspace:@test/skills/draft-skill",
      enabled: true,
      constraints: [],
      origins: [],
    } satisfies DesiredExtensionNode;

    expect(
      canonicalHealthProblem(node, {
        ...observation,
        status: "missing-trust",
      }),
    ).toMatchObject({
      code: "canonical-missing-trust",
      recoveryAction: "axm sync @test/skills/draft-skill",
    });
  });

  it("keeps installed-state recovery in user scope", () => {
    const node = {
      type: "skill",
      name: "draft-skill",
      identity: "@test/skills/draft-skill",
      source: "@test/skills/draft-skill@1.0.0",
      enabled: true,
      constraints: ["1.0.0"],
      origins: [],
    } satisfies DesiredExtensionNode;

    expect(canonicalHealthProblem(node, observation, "user")).toMatchObject({
      blocking: true,
      recoveryAction: "axm sync @test/skills/draft-skill --preview --scope user",
    });
  });

  it("does not redirect legacy user-scope authoring into the project workspace", () => {
    const node = {
      type: "skill",
      name: "draft-skill",
      identity: "workspace:@test/skills/draft-skill",
      source: "workspace:@test/skills/draft-skill",
      enabled: true,
      constraints: [],
      origins: [],
    } satisfies DesiredExtensionNode;

    expect(canonicalHealthProblem(node, observation, "user")).toMatchObject({
      blocking: true,
      recoveryAction: null,
    });
  });
});

describe("projectionIsCurrent", () => {
  it("does not require a subagent projection when no agents are configured", () => {
    expect(projectionIsCurrent({ type: "subagent" }, undefined, [])).toBe(true);
  });

  it("does not require an MCP projection when no agents are configured", () => {
    expect(projectionIsCurrent({ type: "mcp-server" }, undefined, [])).toBe(true);
  });

  it("still requires the universal skill projection when no agents are configured", () => {
    expect(projectionIsCurrent({ type: "skill" }, undefined, [])).toBe(false);
  });
});

describe("receiptOnlySkillProblems", () => {
  const completeGraph = {
    nodes: [],
    problems: [],
    complete: true,
  } satisfies DesiredStateGraph;

  it("surfaces a receipt-only GitHub skill with declare and uninstall recovery", () => {
    const lockedSkills = Schema.decodeUnknownSync(SkillsLockMapSchema)({
      review: {
        type: "github",
        owner: "acme",
        repo: "agent-extensions",
        path: ".agents/skills/review",
        ref: "v1",
        installedAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(receiptOnlySkillProblems(completeGraph, lockedSkills)).toEqual([
      {
        code: "receipt-only-skill",
        extensionType: "skill",
        identity: "review",
        detail:
          "The skill has receipt history but no desired-state declaration; declare it to retain the installed content or uninstall it explicitly with `axm skills uninstall review`",
        blocking: true,
        recoveryAction: "axm skills install github:acme/agent-extensions//.agents/skills/review@v1",
      },
    ]);
  });

  it("does not classify lock rows while the desired pack graph is incomplete", () => {
    const lockedSkills = Schema.decodeUnknownSync(SkillsLockMapSchema)({
      review: {
        type: "registry",
        owner: "@acme",
        name: "review",
        resolvedVersion: "1.0.0",
        integrity: "sha512-AAAA==",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        installedAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    });

    expect(receiptOnlySkillProblems({ ...completeGraph, complete: false }, lockedSkills)).toEqual(
      [],
    );
  });

  it("does not classify a skill retained implicitly by a desired pack", () => {
    const graph = {
      ...completeGraph,
      nodes: [
        {
          type: "pack",
          name: "starter",
          identity: "@test/packs/starter",
          source: "@test/packs/starter@0.0.1",
          enabled: true,
          constraints: [],
          origins: [],
        },
      ],
    } satisfies DesiredStateGraph;
    const lockedSkills = Schema.decodeUnknownSync(SkillsLockMapSchema)({
      "pack-skill": {
        type: "registry",
        owner: "@test",
        name: "pack-skill",
        resolvedVersion: "0.0.1",
        integrity: "sha512-AAAA==",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        installedAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    });
    const lockedPacks = Schema.decodeUnknownSync(PacksLockMapSchema)({
      starter: {
        type: "registry",
        owner: "@test",
        name: "starter",
        resolvedVersion: "0.0.1",
        integrity: "sha512-AAAA==",
        sourceName: "default",
        publisherBindingId: "hbnd_test",
        installedAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        resolvedSkills: {
          "@test/skills/pack-skill": {
            source: "registry",
            version: "0.0.1",
            publisherBindingId: "hbnd_test",
            integrity: "sha512-member",
          },
        },
        resolvedMcpServers: {},
        resolvedSubagents: {},
      },
    });

    expect(receiptOnlySkillProblems(graph, lockedSkills, lockedPacks)).toEqual([]);
  });
});
