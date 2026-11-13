import { withDetailedWork } from "../../locations/testing.js";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";

import { UNCONSTRAINED_DESIRED_NODE } from "../../workspace-state/index.js";
import {
  SHARED_MEMBER,
  SHARED_MEMBER_PIN,
  configuredRow,
  desiredConstraintOf,
  sharedMemberGraph,
} from "../../workspace-state/testing.js";
import type { DesiredExtensionNode, DesiredStateGraph } from "../../workspace-state/index.js";

import {
  decodeVersionRangeSync,
  decodeVersionSync,
  versionSatisfiesRange,
} from "@agentxm/extension-model/unstable/version-constraints";

import { classifyTargetedUpdate } from "./targeted-update-context.js";

const target = {
  type: "skill" as const,
  name: "review",
  fqn: "@acme/skills/review",
};

const configuredPack = (name: string, source: string) =>
  configuredRow({ type: "pack", name, source });

const graph = (
  nodes: ReadonlyArray<DesiredExtensionNode>,
  problems: DesiredStateGraph["problems"] = [],
): DesiredStateGraph => ({
  nodes,
  mcpSourceClosures: [],
  problems,
  packMembership: [],
});

type DesiredOrigin = DesiredExtensionNode["origins"][number];
type TestOrigin =
  DesiredOrigin | Omit<Extract<DesiredOrigin, { readonly type: "pack" }>, "manifestPath">;

const node = (origins: ReadonlyArray<TestOrigin>): DesiredExtensionNode => ({
  type: "skill",
  name: "review",
  identity: {
    authority: "registry",
    fqn: target.fqn,
    registry: { sourceName: undefined, endpoint: undefined },
  },
  source: origins[0]?.source ?? target.fqn,
  enabled: origins.some((origin) => origin.enabled),
  constraint: desiredConstraintOf(
    ...origins.flatMap((origin) => (origin.constraint === undefined ? [] : [origin.constraint])),
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

const expectRangeMembership = (
  range: unknown,
  allowed: ReadonlyArray<string>,
  excluded: ReadonlyArray<string>,
) => {
  const decoded = decodeVersionRangeSync(range);
  for (const version of allowed) {
    expect(versionSatisfiesRange(decodeVersionSync(version), decoded)).toBe(true);
  }
  for (const version of excluded) {
    expect(versionSatisfiesRange(decodeVersionSync(version), decoded)).toBe(false);
  }
};

describe("classifyTargetedUpdate", () => {
  it.effect("blocks an inline MCP target as configuration authority", () =>
    Effect.gen(function* () {
      const inlineTarget = {
        type: "mcp-server" as const,
        name: "linear",
        fqn: "@workspace/mcps/linear",
      };
      const context = yield* classifyTargetedUpdate({
        target: inlineTarget,
        graph: graph([
          {
            type: "mcp-server",
            name: "linear",
            identity: { authority: "inline", name: "linear" },
            authority: "inline",
            enabled: true,
            constraint: UNCONSTRAINED_DESIRED_NODE,
            origins: [{ type: "settings", authority: "inline", enabled: true }],
          },
        ]),
        configuredPacks: [],
      });

      expect(context.public).toMatchObject({
        ownership: "direct-only",
        activation: "enabled",
        authority: "blocked",
        blocker: "source-authority",
        direct: { source: "inline", enabled: true },
      });
    }),
  );

  it.effect("blocks a target with no desired origin", () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const context = yield* classifyTargetedUpdate({
        target,
        graph: graph([]),
        configuredPacks: [],
      }).pipe(withDetailedWork(tracer));
      expect(context.fingerprint).toBe(
        "c16711b4b37d973eda476052c41ee82e616daebd0f2c32369302172faf1dde6e",
      );
      expect(context.bindingFingerprint).toBe(
        "b08d3a68307205c021cee58282f63ff545c7b8468301c2e10d9bea7954ae7e3b",
      );
      expect(context.packEvidenceFingerprint).toBe(
        "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      );
      const hashes = spans.filter((span) => span.name === "axm.hash.targeted-update");
      expect(hashes.map((span) => span.attributes.get("axm.work.count"))).toEqual([1, 1, 1]);
      expect(hashes.map((span) => span.attributes.get("axm.work.bytes"))).toEqual([447, 18, 2]);

      expect(context.public).toMatchObject({
        ownership: "absent",
        activation: "disabled",
        authority: "blocked",
        blocker: "not-desired",
      });
    }),
  );

  it.effect("classifies direct-only ownership and preserves its durable constraint", () =>
    Effect.gen(function* () {
      const context = yield* classifyTargetedUpdate({
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
        direct: { source: "registry", enabled: true, constraint: "^1.0.0" },
        effects: { settings: "unchanged", acceptedResolution: "may-update" },
      });
      expectRangeMembership(
        context.public.effectiveConstraint,
        ["1.0.0", "1.5.0", "1.999.999"],
        ["0.999.999", "1.0.0-alpha", "1.5.0-beta", "2.0.0-0", "2.0.0"],
      );
    }),
  );

  it.effect("matches a bundled official skill and blocks Registry-oriented update truthfully", () =>
    Effect.gen(function* () {
      const bundledTarget = {
        type: "skill" as const,
        name: "axm",
        fqn: "@agentxm/skills/axm",
      };
      const context = yield* classifyTargetedUpdate({
        target: bundledTarget,
        graph: graph([
          {
            type: "skill",
            name: "axm",
            identity: { authority: "bundled", fqn: "@agentxm/skills/axm" },
            authority: "sourced",
            source: "workspace",
            enabled: true,
            constraint: UNCONSTRAINED_DESIRED_NODE,
            origins: [
              {
                type: "settings",
                authority: "sourced",
                source: "workspace",
                enabled: true,
              },
            ],
          },
        ]),
        configuredPacks: [],
      });

      expect(context.public).toMatchObject({
        target: bundledTarget,
        ownership: "direct-only",
        activation: "enabled",
        authority: "blocked",
        direct: { source: "bundled", enabled: true },
        blocker: "bundled-source",
        effects: {
          settings: "unchanged",
          acceptedResolution: "unchanged",
          canonical: "unchanged",
          projection: "unchanged",
          packRoot: "unchanged",
          packManifest: "unchanged",
        },
      });
    }),
  );

  it.effect("classifies one pack as member-scoped pack authority", () =>
    Effect.gen(function* () {
      const context = yield* classifyTargetedUpdate({
        target,
        graph: graph([
          node([
            {
              type: "pack",
              pack: { authority: "registry", fqn: "@acme/packs/toolkit" },
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
    }),
  );

  it.effect("intersects multiple owning pack constraints", () =>
    Effect.gen(function* () {
      const context = yield* classifyTargetedUpdate({
        target,
        graph: graph([
          node([
            {
              type: "pack",
              pack: { authority: "registry", fqn: "@acme/packs/toolkit" },
              source: target.fqn,
              constraint: "^1.0.0",
              enabled: true,
            },
            {
              type: "pack",
              pack: { authority: "registry", fqn: "@acme/packs/reviewers" },
              source: target.fqn,
              constraint: ">=1.4.0 <1.8.0",
              enabled: true,
            },
          ]),
        ]),
        configuredPacks: [
          configuredPack("toolkit", "agentxm:@acme/packs/toolkit@^1.0.0"),
          configuredPack("reviewers", "agentxm:@acme/packs/reviewers@^1.0.0"),
        ],
      });

      expectRangeMembership(
        context.public.effectiveConstraint,
        ["1.4.0", "1.5.0", "1.7.999"],
        ["1.3.999", "1.4.0-alpha", "1.5.0-beta", "1.8.0-0", "1.8.0", "2.0.0"],
      );
      expect(context.public.packs.map(({ fqn, constraint }) => ({ fqn, constraint }))).toEqual([
        { fqn: "@acme/packs/reviewers", constraint: ">=1.4.0 <1.8.0" },
        { fqn: "@acme/packs/toolkit", constraint: "^1.0.0" },
      ]);
    }),
  );

  it.effect("uses direct authority with pack guards for combined ownership", () =>
    Effect.gen(function* () {
      const context = yield* classifyTargetedUpdate({
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
              pack: { authority: "registry", fqn: "@acme/packs/toolkit" },
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
        effects: { settings: "may-update", packManifest: "unchanged" },
      });
      expectRangeMembership(
        context.public.effectiveConstraint,
        ["1.5.0", "1.6.0", "1.8.999"],
        ["1.4.999", "1.5.0-alpha", "1.6.0-beta", "1.9.0-0", "1.9.0", "2.0.0"],
      );
    }),
  );

  it.effect("blocks an effectively disabled target", () =>
    Effect.gen(function* () {
      const disabled = node([
        { type: "settings", source: target.fqn, enabled: false },
        {
          type: "pack",
          pack: { authority: "registry", fqn: "@acme/packs/toolkit" },
          source: target.fqn,
          constraint: "^1.0.0",
          enabled: true,
        },
      ]);
      const context = yield* classifyTargetedUpdate({
        target,
        graph: graph([{ ...disabled, enabled: false }]),
        configuredPacks: [],
      });

      expect(context.public.blocker).toBe("disabled");
    }),
  );

  it.effect("blocks an explicit range on a pack-only target", () =>
    Effect.gen(function* () {
      const context = yield* classifyTargetedUpdate({
        target,
        explicitRange: "^2.0.0",
        graph: graph([
          node([
            {
              type: "pack",
              pack: { authority: "registry", fqn: "@acme/packs/toolkit" },
              source: target.fqn,
              constraint: "^1.0.0",
              enabled: true,
            },
          ]),
        ]),
        configuredPacks: [],
      });

      expect(context.public.blocker).toBe("pack-owned-constraint");
    }),
  );

  it.effect("blocks a pack member whose source authority is workspace-authored", () =>
    Effect.gen(function* () {
      const context = yield* classifyTargetedUpdate({
        target,
        graph: graph([
          node([
            {
              type: "pack",
              pack: { authority: "registry", fqn: "@acme/packs/toolkit" },
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
    }),
  );

  it.effect("treats unreadable configured pack membership as globally relevant", () =>
    Effect.gen(function* () {
      const context = yield* classifyTargetedUpdate({
        target,
        graph: graph(
          [],
          [
            {
              type: "pack-manifest-unavailable",
              pack: "@acme/packs/toolkit",
              path: "/secret/workspace/pack.json",
              reason: "absent",
            },
          ],
        ),
        configuredPacks: [],
      });

      expect(context.public.blocker).toBe("incomplete-graph");
      expect(context.public.relevantProblems).toEqual([
        "pack-manifest-unavailable: @acme/packs/toolkit: authored Pack manifest is absent",
      ]);
      expect(JSON.stringify(context.public)).not.toContain("/secret/workspace");
    }),
  );

  it.effect(
    "reports an unrelated constraint conflict that makes the desired graph incomplete",
    () =>
      Effect.gen(function* () {
        const context = yield* classifyTargetedUpdate({
          target,
          graph: graph(
            [
              node([
                {
                  type: "settings",
                  source: target.fqn,
                  enabled: true,
                  constraint: "^1.0.0",
                },
              ]),
            ],
            [
              {
                type: "constraint-conflict",
                extensionType: "skill",
                name: "commit",
                constraints: ["^1.0.0", "^2.0.0"],
                contributors: [
                  {
                    source: "pack",
                    dependingPack: "@acme/packs/legacy",
                    range: "^1.0.0",
                    location: "agent_extensions/acme/packs/legacy/pack.json",
                  },
                  {
                    source: "pack",
                    dependingPack: "@acme/packs/current",
                    range: "^2.0.0",
                    location: "agent_extensions/acme/packs/current/pack.json",
                  },
                ],
              },
            ],
          ),
          configuredPacks: [],
        });

        expect(context.public.blocker).toBe("incomplete-graph");
        expect(context.public.relevantProblems).toEqual([
          "constraint-conflict: skill commit: incompatible constraints @acme/packs/legacy range=^1.0.0 location=agent_extensions/acme/packs/legacy/pack.json, @acme/packs/current range=^2.0.0 location=agent_extensions/acme/packs/current/pack.json; decision=blocked; reason=no-satisfying-version",
        ]);
      }),
  );

  it.effect("blocks an empty direct-and-pack constraint intersection", () =>
    Effect.gen(function* () {
      const context = yield* classifyTargetedUpdate({
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
              pack: { authority: "registry", fqn: "@acme/packs/toolkit" },
              source: target.fqn,
              constraint: "^2.0.0",
              enabled: true,
            },
          ]),
        ]),
        configuredPacks: [],
      });

      expect(context.public.blocker).toBe("constraint-conflict");
    }),
  );
});

describe("targeted update fingerprints", () => {
  /** Two configured Registries, `alias` naming the first again; the default one is `primary`. */
  const sources = [
    { name: "primary", type: "registry", location: "https://primary.example.com" },
    { name: "mirror", type: "registry", location: "https://mirror.example.com" },
    { name: "alias", type: "registry", location: "https://primary.example.com/" },
  ];

  /** The shared-member context with the direct declaration spelled `declared`. */
  const contextFor = (declared: string) =>
    sharedMemberGraph(SHARED_MEMBER_PIN.inside, {
      sources,
      defaultRegistry: "primary",
      skills: { [SHARED_MEMBER.name]: declared },
    }).pipe(
      Effect.flatMap((graph) =>
        classifyTargetedUpdate({
          target: { type: "skill", name: SHARED_MEMBER.name, fqn: SHARED_MEMBER.fqn },
          graph,
          configuredPacks: [],
        }),
      ),
    );

  const bare = `${SHARED_MEMBER.fqn}@${SHARED_MEMBER_PIN.inside}`;

  it.effect("agrees for a bare FQN and a locator qualified by the Registry it binds to", () =>
    Effect.gen(function* () {
      const unqualified = yield* contextFor(bare);
      const qualified = yield* contextFor(`primary:${bare}`);

      expect(qualified.fingerprint).toBe(unqualified.fingerprint);
      expect(qualified.bindingFingerprint).toBe(unqualified.bindingFingerprint);
    }),
  );

  it.effect("agrees for two configured aliases of one Registry endpoint", () =>
    Effect.gen(function* () {
      const primary = yield* contextFor(`primary:${bare}`);
      const alias = yield* contextFor(`alias:${bare}`);

      expect(alias.fingerprint).toBe(primary.fingerprint);
      expect(alias.bindingFingerprint).toBe(primary.bindingFingerprint);
    }),
  );

  it.effect("differs for the same FQN bound to a different configured Registry", () =>
    Effect.gen(function* () {
      const primary = yield* contextFor(bare);
      const mirror = yield* contextFor(`mirror:${bare}`);

      expect(mirror.public.direct).toEqual(primary.public.direct);
      expect(mirror.fingerprint).not.toBe(primary.fingerprint);
      expect(mirror.bindingFingerprint).not.toBe(primary.bindingFingerprint);
    }),
  );

  it.effect("differs for a changed direct constraint on the same binding", () =>
    Effect.gen(function* () {
      const inside = yield* contextFor(bare);
      const changed = yield* contextFor(`${SHARED_MEMBER.fqn}@1.2.0`);

      expect(changed.fingerprint).not.toBe(inside.fingerprint);
      expect(changed.bindingFingerprint).toBe(inside.bindingFingerprint);
    }),
  );
});
