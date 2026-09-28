import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  evaluateAxmSkillCompatibility,
} from "@agentxm/cli-maintenance/official-skill/domain";
import type { AxmSkillCompatibilityPolicyService } from "@agentxm/cli-maintenance/official-skill/application";
import {
  UNCONSTRAINED_DESIRED_NODE,
  type CanonicalObservationStatus,
  type DesiredExtensionNode,
  type DesiredNodeIdentity,
} from "../workspace-state/index.js";
import {
  assessOfficialAxmSkill,
  selectOfficialAxmSkill,
  type ObservedOfficialAxmSkillCandidate,
} from "./axm-skill-workspace-compatibility.js";

const CLI_VERSION = "1.2.3";
const RANGE = ">=1.2.0 <1.3.0";
const OLD_RANGE = ">=1.1.0 <1.2.0";
const REGISTRY_SOURCE = "agentxm:@agentxm/skills/axm";

const policy: AxmSkillCompatibilityPolicyService = {
  evaluate: ({ fqn, candidate }) =>
    fqn === "@agentxm/skills/axm"
      ? evaluateAxmSkillCompatibility({ cliVersion: CLI_VERSION, skill: candidate })
      : null,
};

const registry = (fqn: string): DesiredNodeIdentity => ({
  authority: "registry",
  fqn,
  registry: { sourceName: "agentxm", endpoint: undefined },
});

const desiredAxm = (
  identity: DesiredNodeIdentity,
  source = REGISTRY_SOURCE,
): DesiredExtensionNode => ({
  type: "skill",
  name: "axm",
  identity,
  source,
  enabled: true,
  constraint: UNCONSTRAINED_DESIRED_NODE,
  origins: [{ type: "settings", source, enabled: true }],
});

const observed = (
  desired: DesiredExtensionNode,
  status: CanonicalObservationStatus,
  path?: string,
): ObservedOfficialAxmSkillCandidate =>
  status === "constraint-mismatch"
    ? {
        desired,
        observation: {
          type: "skill",
          name: "axm",
          status,
          ...(path === undefined ? {} : { path }),
          authority: {
            source: "desired-state-graph",
            identity: "@agentxm/skills/axm",
            locator: REGISTRY_SOURCE,
            constraints: [],
          },
        },
      }
    : {
        desired,
        observation: {
          type: "skill",
          name: "axm",
          status,
          ...(path === undefined ? {} : { path }),
        },
      };

const writePackage = (root: string, version: string, range: string): void => {
  nodeFs.mkdirSync(nodePath.join(root, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(root, "skill.json"),
    JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version }),
  );
  nodeFs.writeFileSync(
    nodePath.join(root, "src", "SKILL.md"),
    `---\nname: axm\ndescription: AXM workflow guidance\nmetadata:\n  ${AXM_SKILL_CLI_VERSION_METADATA_KEY}: "${version}"\n  ${AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY}: "${range}"\n---\n`,
  );
};

describe("selectOfficialAxmSkill", () => {
  const official = desiredAxm(registry("@agentxm/skills/axm"));
  const otherOwner = desiredAxm({ authority: "workspace", fqn: "@acme/skills/axm" }, "workspace");
  const gitHosted = desiredAxm({ authority: "git", locator: "github:acme/axm" }, "github:acme/axm");

  it("selects the node whose identity names the official skill, in either order", () => {
    const officialRow = observed(official, "usable", "/canonical");
    const otherRow = observed(otherOwner, "usable", "/authored");
    for (const rows of [
      [officialRow, otherRow],
      [otherRow, officialRow],
    ]) {
      expect(Option.map(selectOfficialAxmSkill(rows), ({ desired }) => desired)).toEqual(
        Option.some(official),
      );
    }
  });

  it("never selects another owner's or an unaccepted git-hosted skill named axm", () => {
    expect(
      selectOfficialAxmSkill([
        observed(otherOwner, "usable", "/authored"),
        observed(gitHosted, "usable", "/git"),
      ]),
    ).toEqual(Option.none());
  });

  it("selects the official skill a Pack desires, with or without a configuration-only entry", () => {
    const viaPack: DesiredExtensionNode = {
      ...official,
      origins: [
        {
          type: "pack",
          pack: { authority: "registry", fqn: "@acme/packs/reviews" },
          manifestPath: "/workspace/agent_extensions/registry/@acme/packs/reviews/pack.json",
          source: REGISTRY_SOURCE,
          constraint: "^1.2.0",
          enabled: true,
        },
      ],
    };
    const configuredMember: DesiredExtensionNode = {
      ...viaPack,
      preference: { localName: "axm", location: "axm.json", enabled: true },
    };
    for (const desired of [viaPack, configuredMember]) {
      const row = observed(desired, "usable", "/canonical");
      expect(selectOfficialAxmSkill([row])).toEqual(Option.some({ ...row, authority: "registry" }));
    }
  });

  it("maps the desired identity to the recovery authority", () => {
    const authorities = [
      registry("@agentxm/skills/axm"),
      { authority: "bundled", fqn: "@agentxm/skills/axm" } as const,
      { authority: "workspace", fqn: "@agentxm/skills/axm" } as const,
    ].map((identity) =>
      Option.map(
        selectOfficialAxmSkill([observed(desiredAxm(identity), "usable", "/c")]),
        ({ authority }) => authority,
      ),
    );
    expect(authorities).toEqual([
      Option.some("registry"),
      Option.some("bundled"),
      Option.some("workspace"),
    ]);
  });
});

layer(NodeServices.layer, { excludeTestServices: true })("assessOfficialAxmSkill", (it) => {
  let root: string;
  const official = desiredAxm(registry("@agentxm/skills/axm"));

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-official-skill-"));
  });
  afterEach(() => nodeFs.rmSync(root, { recursive: true, force: true }));

  const canonical = () => nodePath.join(root, "agent_extensions/registry/@agentxm/skills/axm");
  const extraneous = () => nodePath.join(root, "agent_extensions/agentxm/@agentxm/skills/axm");

  it.effect("reports undeclared when the desired state selects no official skill", () =>
    Effect.gen(function* () {
      writePackage(extraneous(), "1.2.0", RANGE);
      expect(yield* assessOfficialAxmSkill({ selected: Option.none(), policy })).toEqual({
        _tag: "undeclared",
      });
    }),
  );

  it.effect("keeps a compatible selected package compatible beside an incompatible copy", () =>
    Effect.gen(function* () {
      writePackage(canonical(), "1.2.0", RANGE);
      writePackage(extraneous(), "1.1.0", OLD_RANGE);
      const assessment = yield* assessOfficialAxmSkill({
        selected: selectOfficialAxmSkill([observed(official, "usable", canonical())]),
        policy,
      });
      expect(assessment).toMatchObject({
        _tag: "assessed",
        path: canonical(),
        authority: "registry",
        compatibility: {
          status: "compatible",
          skillVersion: "1.2.0",
          declaredCliVersionRange: RANGE,
          source: REGISTRY_SOURCE,
        },
      });
    }),
  );

  it.effect("fails an incompatible selected package even beside a compatible copy", () =>
    Effect.gen(function* () {
      writePackage(canonical(), "1.1.0", OLD_RANGE);
      writePackage(extraneous(), "1.2.0", RANGE);
      const assessment = yield* assessOfficialAxmSkill({
        selected: selectOfficialAxmSkill([observed(official, "usable", canonical())]),
        policy,
      });
      expect(assessment).toMatchObject({
        _tag: "assessed",
        path: canonical(),
        compatibility: {
          status: "incompatible",
          skillVersion: "1.1.0",
          reasonCode: "cli-version-incompatible",
          recovery: { action: "update-registry-skill" },
        },
      });
    }),
  );

  it.effect("reports a missing selected package without falling back to a healthy copy", () =>
    Effect.gen(function* () {
      writePackage(extraneous(), "1.2.0", RANGE);
      const assessment = yield* assessOfficialAxmSkill({
        selected: selectOfficialAxmSkill([observed(official, "missing", canonical())]),
        policy,
      });
      expect(assessment).toMatchObject({
        _tag: "assessed",
        path: canonical(),
        compatibility: { status: "incompatible", reasonCode: "axm-skill-missing" },
      });
    }),
  );

  it.effect.each([
    "missing-resolution",
    "wrong-origin",
    "constraint-mismatch",
    "materialization-mismatch",
  ] as const)("leaves %s canonical state unassessed rather than judging other content", (status) =>
    Effect.gen(function* () {
      writePackage(canonical(), "1.2.0", RANGE);
      writePackage(extraneous(), "1.2.0", RANGE);
      const assessment = yield* assessOfficialAxmSkill({
        selected: selectOfficialAxmSkill([observed(official, status, canonical())]),
        policy,
      });
      expect(assessment).toEqual({
        _tag: "canonical-state",
        path: canonical(),
        authority: "registry",
        status,
      });
    }),
  );

  it.effect("keeps the precise invalid-manifest reason for malformed selected content", () =>
    Effect.gen(function* () {
      writePackage(canonical(), "1.2.0", RANGE);
      nodeFs.writeFileSync(nodePath.join(canonical(), "skill.json"), "{not json");
      const assessment = yield* assessOfficialAxmSkill({
        selected: selectOfficialAxmSkill([observed(official, "corrupt", canonical())]),
        policy,
      });
      expect(assessment).toMatchObject({
        _tag: "assessed",
        compatibility: { reasonCode: "axm-skill-manifest-invalid" },
      });
    }),
  );

  it.effect("names bundled authority in the source it reports", () =>
    Effect.gen(function* () {
      writePackage(canonical(), "1.2.0", RANGE);
      const assessment = yield* assessOfficialAxmSkill({
        selected: selectOfficialAxmSkill([
          observed(
            desiredAxm({ authority: "bundled", fqn: "@agentxm/skills/axm" }, "workspace"),
            "usable",
            canonical(),
          ),
        ]),
        policy,
      });
      expect(assessment).toMatchObject({
        _tag: "assessed",
        authority: "bundled",
        compatibility: { source: "bundled:@agentxm/skills/axm@1.2.0" },
      });
    }),
  );

  it.effect.skipIf(process.getuid?.() === 0)(
    "reports an unreadable selected package as unavailable at its location",
    () =>
      Effect.gen(function* () {
        writePackage(canonical(), "1.2.0", RANGE);
        nodeFs.chmodSync(nodePath.join(canonical(), "skill.json"), 0o000);
        const assessment = yield* assessOfficialAxmSkill({
          selected: selectOfficialAxmSkill([observed(official, "usable", canonical())]),
          policy,
        });
        expect(assessment).toMatchObject({
          _tag: "unavailable",
          path: canonical(),
          authority: "registry",
        });
      }),
  );
});
