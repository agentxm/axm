import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  getAppError,
  handleInstall,
  type ReleaseAgePostureValue,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { makeSpecRegistry } from "../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "source-resolution/minimum-release-age-withholds-unaged-releases",
  title: "Resolution withholds a release that has not aged, unless it is exempt",
  statement:
    "When a resolution selects a release without an explicit version request, the resolution shall withhold a candidate that has not reached the configured minimum release age unless that candidate's identity matches a declared exemption, and every withheld and every exempted candidate shall be reported with its eligibility time and, when exempted, its exemption cause and scope.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "fresh";
const FQN = `@acme/skills/${SKILL}`;

interface Scenario {
  /** Extra project `axm.json` keys beyond the configured skill and source. */
  readonly settings?: {
    readonly minimumReleaseAge?: string;
    readonly minimumReleaseAgeExclude?: ReadonlyArray<string>;
  };
  /** User-scope `axm.json` keys, when the case is about scope precedence. */
  readonly userSettings?: { readonly minimumReleaseAgeExclude?: ReadonlyArray<string> };
  readonly posture?: ReleaseAgePostureValue;
}

/**
 * A workspace whose only configured skill was published moments ago, so the
 * default 24h window still holds it unless the case says otherwise.
 */
const unagedWorkspace = (cleanups: Array<() => void>, scenario: Scenario = {}) => {
  const registry = makeSpecRegistry();
  cleanups.push(registry.cleanup);
  registry.writeSkill(SKILL, [
    { version: "1.0.0", body: "Fresh guidance.", published: new Date().toISOString() },
  ]);
  const workspace = makeSpecWorkspace({
    machine: true,
    flags: { json: true },
    ...(scenario.posture === undefined ? {} : { releaseAgePosture: scenario.posture }),
    ...(scenario.userSettings === undefined
      ? {}
      : { userSettings: { agents: ["claude-code"], ...scenario.userSettings } }),
    settings: {
      sources: [registry.source],
      skills: { [SKILL]: FQN },
      ...scenario.settings,
    },
  });
  cleanups.push(workspace.cleanup);
  return workspace;
};

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const configuredInstall = (workspace: SpecWorkspace) =>
  handleInstall({ source: Option.none(), force: false, preview: false }).pipe(
    Effect.provide(workspace.layer),
  );

const lastResult = (workspace: SpecWorkspace): Record<string, unknown> => {
  const document = workspace.rendererState.results.at(-1)?.data;
  expect(document).toMatchObject({ result: {} });
  const result = (document as { readonly result: Record<string, unknown> }).result;
  return result;
};

/**
 * Each row states one exemption input and whether the candidate is selected.
 * The precedence the table encodes is: a declared exclusion outranks the
 * one-shot posture, and both outrank the hold.
 */
interface ExemptRow {
  readonly exemption: string;
  readonly scenario: Scenario;
  readonly bypassCause: string;
  readonly exemptionScope?: string;
}

const exemptRows: ReadonlyArray<ExemptRow> = [
  {
    exemption: "an exact project exclusion",
    scenario: { settings: { minimumReleaseAgeExclude: [FQN] } },
    bypassCause: "exclude",
    exemptionScope: "project",
  },
  {
    exemption: "an owner/type project exclusion pattern",
    scenario: { settings: { minimumReleaseAgeExclude: ["@acme/skills/*"] } },
    bypassCause: "exclude",
    exemptionScope: "project",
  },
  {
    exemption: "an owner project exclusion pattern",
    scenario: { settings: { minimumReleaseAgeExclude: ["@acme/*"] } },
    bypassCause: "exclude",
    exemptionScope: "project",
  },
  {
    exemption: "a user exclusion the project does not override",
    scenario: { userSettings: { minimumReleaseAgeExclude: [FQN] } },
    bypassCause: "exclude",
    exemptionScope: "user",
  },
  {
    exemption: "the one-shot override",
    scenario: { posture: "ignore" },
    bypassCause: "ignore-flag",
  },
  {
    exemption: "an exclusion outranking the one-shot override",
    scenario: { settings: { minimumReleaseAgeExclude: [FQN] }, posture: "ignore" },
    bypassCause: "exclude",
    exemptionScope: "project",
  },
];

describe("Minimum release age", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("withholds a candidate that has not reached the configured age", () =>
    Effect.gen(function* () {
      const workspace = unagedWorkspace(cleanups);

      const failure = yield* configuredInstall(workspace).pipe(Effect.flip);

      const error = getAppError(failure);
      expect(error.title).toBe("Release held by minimum release age");
      expect(error.detail).toContain(`${FQN}@1.0.0`);
      expect(workspace.readLockfileText()).not.toContain(SKILL);
      expect(workspace.exists(`.claude/skills/${SKILL}`)).toBe(false);
    }),
  );

  it.effect("selects a candidate that has reached the configured age", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [{ version: "1.0.0", body: "Aged guidance." }]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { sources: [registry.source], skills: { [SKILL]: FQN } },
      });
      cleanups.push(workspace.cleanup);

      yield* configuredInstall(workspace);

      expect(lastResult(workspace)).toMatchObject({ outcome: "applied" });
      expect(lastResult(workspace)["releaseAgeBypasses"]).toBeUndefined();
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
    }),
  );

  it.effect("takes an unaged candidate the configured age itself does not hold", () =>
    Effect.gen(function* () {
      const workspace = unagedWorkspace(cleanups, { settings: { minimumReleaseAge: "0s" } });

      yield* configuredInstall(workspace);

      expect(lastResult(workspace)).toMatchObject({ outcome: "applied" });
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
    }),
  );

  it.effect.each(exemptRows)(
    "takes an unaged candidate exempted by $exemption",
    ({ scenario, bypassCause, exemptionScope }) =>
      Effect.gen(function* () {
        const workspace = unagedWorkspace(cleanups, scenario);

        yield* configuredInstall(workspace);

        const result = lastResult(workspace);
        expect(result).toMatchObject({ outcome: "applied" });
        expect(result["releaseAgeBypasses"]).toMatchObject([
          {
            target: FQN,
            candidateVersion: "1.0.0",
            bypassCause,
            ...(exemptionScope === undefined ? {} : { exemptionScope }),
          },
        ]);
        expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
      }),
  );

  it.effect("reports the eligibility time of every exempted candidate", () =>
    Effect.gen(function* () {
      const workspace = unagedWorkspace(cleanups, { posture: "ignore" });

      yield* configuredInstall(workspace);

      const result = lastResult(workspace);
      const [bypass] = (result["releaseAgeBypasses"] ?? []) as ReadonlyArray<{
        readonly publishedAt: string;
        readonly eligibleAt: string;
        readonly minimumReleaseAgeSeconds: number;
      }>;
      expect(bypass).toBeDefined();
      expect(bypass?.minimumReleaseAgeSeconds).toBe(86_400);
      expect(Date.parse(bypass?.eligibleAt ?? "")).toBe(
        Date.parse(bypass?.publishedAt ?? "") + 86_400_000,
      );
      expect(typeof result["evaluatedAt"]).toBe("string");
    }),
  );

  it.effect("lets an explicit empty project exclusion list override a user list", () =>
    Effect.gen(function* () {
      const workspace = unagedWorkspace(cleanups, {
        settings: { minimumReleaseAgeExclude: [] },
        userSettings: { minimumReleaseAgeExclude: [FQN] },
      });

      const failure = yield* configuredInstall(workspace).pipe(Effect.flip);

      expect(getAppError(failure).title).toBe("Release held by minimum release age");
      expect(workspace.readLockfileText()).not.toContain(SKILL);
    }),
  );

  it.effect("does not exempt an identity no declared pattern matches", () =>
    Effect.gen(function* () {
      const workspace = unagedWorkspace(cleanups, {
        settings: { minimumReleaseAgeExclude: ["@other/*", "@acme/rules/*"] },
      });

      const failure = yield* configuredInstall(workspace).pipe(Effect.flip);

      expect(getAppError(failure).title).toBe("Release held by minimum release age");
      expect(workspace.readLockfileText()).not.toContain(SKILL);
    }),
  );
});
