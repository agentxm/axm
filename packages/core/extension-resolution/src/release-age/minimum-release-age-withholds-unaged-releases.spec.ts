/**
 * Requirement: source-resolution/minimum-release-age-withholds-unaged-releases.
 *
 * Bound where the policy is decided: the evaluation the workspace's settings
 * and the command's posture produce, and the named-Registry decision that
 * evaluation drives. The withheld and exempted candidates are observed on the
 * typed evidence the resolution carries, not on a rendered document.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry/schema";
import { WorkspaceStateLive } from "@agentxm/workspace-state/live";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfiguredReleaseAgeEvaluation } from "../configured-entry-resolution.js";
import { decideNamedRegistryVersion } from "../named-registry-resolution.js";
import { ReleaseAgePosture, type ReleaseAgePostureValue } from "../release-age-posture.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";

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
  assumptions: [
    "A held release is refused before anything is written: cli/mutations-are-closure-atomic owns that a refused closure leaves the workspace unchanged, and cli/withheld-releases-name-recovery-from-the-emitting-command owns the wording and recovery routes the refusal names.",
  ],
  openQuestions: [],
});

const OWNER = "@acme";
const SKILL = "fresh";
const FQN = `${OWNER}/skills/${SKILL}`;
const DEFAULT_WINDOW_SECONDS = 86_400;

interface Scenario {
  /** Project `axm.json` release-age keys. */
  readonly settings?: {
    readonly minimumReleaseAge?: string;
    readonly minimumReleaseAgeExclude?: ReadonlyArray<string>;
  };
  /** User-scope `axm.json` keys, when the case is about scope precedence. */
  readonly userSettings?: { readonly minimumReleaseAgeExclude?: ReadonlyArray<string> };
  readonly posture?: ReleaseAgePostureValue;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * A real project workspace with a hermetic user home, so project-over-user
 * precedence is read the way the product reads it rather than stated by the
 * fixture.
 */
const evaluationFor = (scenario: Scenario = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-release-age-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-release-age-home-")));
  cleanups.push(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.mkdirSync(nodePath.join(home, ".axm", "workspace"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(root, "axm.json"),
    `${JSON.stringify({ agents: ["claude-code"], owner: OWNER, ...scenario.settings }, null, 2)}\n`,
  );
  if (scenario.userSettings !== undefined) {
    fs.writeFileSync(
      nodePath.join(home, ".axm", "workspace", "axm.json"),
      `${JSON.stringify({ agents: ["claude-code"], ...scenario.userSettings }, null, 2)}\n`,
    );
  }

  return makeConfiguredReleaseAgeEvaluation().pipe(
    Effect.provide(
      Layer.provideMerge(
        Layer.merge(
          WorkspaceStateLive({
            scope: "project",
            projectRoot: decodeAbsolutePathSync(root),
            allowUninitialized: true,
          }),
          Layer.succeed(ReleaseAgePosture, scenario.posture ?? "enforce"),
        ),
        Layer.merge(
          NodeServices.layer,
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
        ),
      ),
    ),
  );
};

/** One published release of the configured skill, published at the stated instant. */
const indexPublished = (published: DateTime.Utc): ExtensionIndex => ({
  owner: handle(OWNER),
  type: "skill",
  name: extensionName(SKILL),
  publisherBindingId: "hbnd_acme",
  deprecation: null,
  versions: [
    {
      version: exactVersion("1.0.0"),
      published,
      integrity: "sha512-0000",
    },
  ],
});

/**
 * Ages are stated against the instant the evaluation itself reads, so a case
 * says "published now" or "published three days ago" and means it whatever
 * clock the run uses.
 */
const justPublished = (evaluatedAt: DateTime.Utc) => indexPublished(evaluatedAt);
const publishedDaysAgo = (days: number) => (evaluatedAt: DateTime.Utc) =>
  indexPublished(DateTime.subtractDuration(evaluatedAt, Duration.days(days)));

/** The decision a configured entry makes: no explicit version was requested. */
const decide = (
  publishedAt: (evaluatedAt: DateTime.Utc) => ExtensionIndex,
  scenario: Scenario = {},
) =>
  Effect.gen(function* () {
    const releaseAgeEvaluation = yield* evaluationFor(scenario);
    return {
      releaseAgeEvaluation,
      decision: decideNamedRegistryVersion(publishedAt(releaseAgeEvaluation.evaluatedAt), {
        name: SKILL,
        type: "skill",
        owner: handle(OWNER),
        versionRange: Option.none(),
        releaseAgeEvaluation,
      }),
    };
  });

/**
 * Each row states one exemption input and the cause and scope the exempted
 * candidate is reported with. The precedence the table encodes is: a declared
 * exclusion outranks the one-shot posture, and both outrank the hold.
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
    scenario: { settings: { minimumReleaseAgeExclude: [`${OWNER}/skills/*`] } },
    bypassCause: "exclude",
    exemptionScope: "project",
  },
  {
    exemption: "an owner project exclusion pattern",
    scenario: { settings: { minimumReleaseAgeExclude: [`${OWNER}/*`] } },
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
  it.effect("withholds a candidate that has not reached the configured age", () =>
    Effect.gen(function* () {
      const { decision } = yield* decide(justPublished);

      expect(decision.kind).toBe("policy_held");
      if (decision.kind !== "policy_held") return;
      expect(decision.candidate.version).toBe("1.0.0");
      expect(decision.candidate.minimumReleaseAgeSeconds).toBe(DEFAULT_WINDOW_SECONDS);
      expect(Date.parse(decision.candidate.eligibleAt)).toBe(
        Date.parse(decision.candidate.publishedAt) + DEFAULT_WINDOW_SECONDS * 1_000,
      );
    }),
  );

  it.effect("selects a candidate that has reached the configured age", () =>
    Effect.gen(function* () {
      const { decision } = yield* decide(publishedDaysAgo(3));

      expect(decision).toEqual({ kind: "selected", version: "1.0.0" });
    }),
  );

  it.effect("takes an unaged candidate the configured age itself does not hold", () =>
    Effect.gen(function* () {
      const { decision } = yield* decide(justPublished, {
        settings: { minimumReleaseAge: "0s" },
      });

      expect(decision).toEqual({ kind: "selected", version: "1.0.0" });
    }),
  );

  it.effect.each(exemptRows)(
    "takes an unaged candidate exempted by $exemption",
    ({ scenario, bypassCause, exemptionScope }) =>
      Effect.gen(function* () {
        const { decision } = yield* decide(justPublished, scenario);

        expect(decision.kind).toBe("exempted");
        if (decision.kind !== "exempted") return;
        expect(decision.version).toBe("1.0.0");
        expect(decision.bypassed.version).toBe("1.0.0");
        expect(decision.exemption).toEqual({
          bypassCause,
          ...(exemptionScope === undefined ? {} : { exemptionScope }),
        });
      }),
  );

  it.effect("reports the eligibility time of every exempted candidate", () =>
    Effect.gen(function* () {
      const { decision, releaseAgeEvaluation } = yield* decide(justPublished, {
        posture: "ignore",
      });

      expect(decision.kind).toBe("exempted");
      if (decision.kind !== "exempted") return;
      expect(decision.bypassed.minimumReleaseAgeSeconds).toBe(DEFAULT_WINDOW_SECONDS);
      expect(Date.parse(decision.bypassed.eligibleAt)).toBe(
        Date.parse(decision.bypassed.publishedAt) + DEFAULT_WINDOW_SECONDS * 1_000,
      );
      // The evaluation the whole operation is reported against.
      expect(DateTime.formatIso(releaseAgeEvaluation.evaluatedAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    }),
  );

  it.effect("lets an explicit empty project exclusion list override a user list", () =>
    Effect.gen(function* () {
      const { decision } = yield* decide(justPublished, {
        settings: { minimumReleaseAgeExclude: [] },
        userSettings: { minimumReleaseAgeExclude: [FQN] },
      });

      expect(decision.kind).toBe("policy_held");
    }),
  );

  it.effect("does not exempt an identity no declared pattern matches", () =>
    Effect.gen(function* () {
      const { decision } = yield* decide(justPublished, {
        settings: { minimumReleaseAgeExclude: ["@other/*", `${OWNER}/rules/*`] },
      });

      expect(decision.kind).toBe("policy_held");
    }),
  );
});
