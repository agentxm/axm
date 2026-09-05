import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleDemote, handleLogin, handleSetup } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  COMMAND_ROUTE_ALLOCATION,
  PREAPPROVAL_ROUTES,
  formatRoute,
} from "../support/command-routes.js";
import { makeSpecWorkspace } from "../support/install-harness.js";
import {
  DEVICE_USER_CODE,
  EXISTING_ACCESS_TOKEN,
  EXISTING_HANDLE,
  LOGIN_REGISTRY_HOST,
  makeLoginSpecContext,
} from "../support/login-harness.js";
import { unrecognizedOptions } from "../support/parser-probe.js";
import { writeAuthoredSkill } from "../support/publish-harness.js";
import { makeSpecRegistry } from "../support/registry-fixture.js";
import { makeSetupSpecContext } from "../support/setup-harness.js";

export const specification = defineSpecification({
  requirement: "cli/confirmation-flags-have-a-supported-purpose",
  title: "Advance approval is offered only where it settles one documented decision",
  statement:
    "A command shall accept the advance-approval flag only when it documents the one confirmation that flag settles, an invocation carrying the flag shall change that command's outcome exactly as documented, and every other command shall reject the flag and its short spelling before any work begins.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  methods: ["contract", "example"],
  derivedFrom: [
    "cli/demote/preview-is-pure",
    "cli/setup/unattended-apply-requires-explicit-intent",
    "cli/login/preapproval-requests-new-sign-in",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * The one decision advance approval settles on each route that offers it,
 * keyed by the route's full spelling. The architecture gate reads these
 * spellings from this file, so a route that gains the flag without a purpose
 * fixture here fails that gate rather than shipping an unexplained flag.
 */
const PREAPPROVAL_PURPOSES: Readonly<Record<string, string>> = {
  "axm demote": "replacing workspace source authority with the externally sourced package",
  "axm setup":
    "applying the documented unattended setup defaults with an explicit scope and explicit agents",
  "axm login": "starting a new sign-in without prompting when a valid session already exists",
};

const SKILL = "review";
const FQN = `@acme/skills/${SKILL}`;

describe("Advance approval", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it("documents a purpose for exactly the routes the allocation marks preapprovable", () => {
    expect(Object.keys(PREAPPROVAL_PURPOSES).sort()).toEqual(
      PREAPPROVAL_ROUTES.map((route) => formatRoute(route.path)).sort(),
    );
    for (const purpose of Object.values(PREAPPROVAL_PURPOSES)) {
      expect(purpose.length).toBeGreaterThan(0);
    }
  });

  it.effect("every route accepts or rejects both spellings exactly as the allocation states", () =>
    Effect.gen(function* () {
      const disagreements: Array<string> = [];
      for (const route of COMMAND_ROUTE_ALLOCATION) {
        const unrecognized = yield* unrecognizedOptions([...route.path, "--yes", "-y"]);
        const rejectsLong = unrecognized.includes("--yes");
        const rejectsShort = unrecognized.includes("-y");
        const agrees = route.preapproval
          ? !rejectsLong && !rejectsShort
          : rejectsLong && rejectsShort;
        if (!agrees) {
          disagreements.push(`${formatRoute(route.path)}: unrecognized ${unrecognized.join(" ")}`);
        }
      }
      expect(disagreements).toEqual([]);
      // The allocation is the complete registered surface, not a sample.
      expect(COMMAND_ROUTE_ALLOCATION.length).toBeGreaterThan(100);
    }),
  );

  describe("axm demote", () => {
    /**
     * A workspace that authors the skill while the configured Registry serves
     * the same skill, so demotion has an externally sourced replacement to
     * take authority from the workspace.
     */
    const authoredWithRegistryReplacement = () => {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [{ version: "1.0.0", body: "Registry guidance." }]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { owner: "@acme", skills: { [SKILL]: "workspace" }, sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSkill(workspace.root, { name: SKILL });
      return workspace;
    };

    const demote = (yes: boolean) => handleDemote({ fqn: FQN, source: FQN, yes, preview: false });

    it.effect(
      "an unattended apply without approval stops before replacing authority and names the flag",
      () =>
        Effect.gen(function* () {
          const workspace = authoredWithRegistryReplacement();

          yield* demote(false).pipe(Effect.provide(workspace.layer));

          expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
          const [entry] = workspace.rendererState.results;
          expect(entry?.ok).toBe(false);
          expect(entry?.data).toMatchObject({
            result: {
              outcome: "blocked",
              counts: { committed: 0 },
              blocking: {
                class: "approval-required",
                subject: "replace-workspace-authority",
                escape: { cmd: expect.stringContaining("--yes") },
              },
            },
          });
          expect(workspace.readSettings()).toMatchObject({ skills: { [SKILL]: "workspace" } });
          expect(workspace.exists(`skills/${SKILL}/skill.json`)).toBe(true);
          expect(workspace.readLockfileText()).not.toContain(`publisherBindingId`);
        }),
    );

    it.effect("the same apply with approval replaces workspace authority without a prompt", () =>
      Effect.gen(function* () {
        const workspace = authoredWithRegistryReplacement();

        yield* demote(true).pipe(Effect.provide(workspace.layer));

        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: { outcome: "applied", counts: { committed: 1 } },
        });
        expect(workspace.readSettings()).toMatchObject({ skills: { [SKILL]: `agentxm:${FQN}` } });
        expect(workspace.readLockfileText()).toContain("resolvedVersion: 1.0.0");
        expect(workspace.exists(`skills/${SKILL}`)).toBe(false);
      }),
    );
  });

  describe("axm setup", () => {
    const unattended = () => {
      const context = makeSetupSpecContext({
        machine: true,
        flags: { nonInteractive: true, json: true },
        recordWrites: true,
      });
      cleanups.push(context.cleanup);
      return context;
    };

    it.effect(
      "a fresh unattended apply without approval stops as approval required and writes nothing",
      () =>
        Effect.gen(function* () {
          const context = unattended();

          const exit = yield* handleSetup({
            scope: "project",
            scopeExplicit: true,
            agents: ["claude-code"],
          }).pipe(Effect.provide(context.layer), Effect.exit);

          expect(Exit.isFailure(exit)).toBe(true);
          const entry = context.rendererState.results.at(-1);
          expect(entry?.ok).toBe(false);
          expect(entry?.data).toMatchObject({
            result: { outcome: "failed", status: "approval-required", changed: false },
          });
          expect(context.promptState.selectAgentsCalls).toEqual([]);
          expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
          expect(context.writes).toEqual([]);
          expect(context.exists("axm.json")).toBe(false);
          expect(context.exists(".axm")).toBe(false);
        }),
    );

    it.effect(
      "the same apply with approval, an explicit scope, and explicit agents initializes the workspace",
      () =>
        Effect.gen(function* () {
          const context = unattended();

          yield* handleSetup({
            scope: "project",
            scopeExplicit: true,
            agents: ["claude-code"],
            yes: true,
          }).pipe(Effect.provide(context.layer));

          expect(context.rendererState.results[0]?.data).toMatchObject({
            result: {
              outcome: "applied",
              status: "initialized",
              changed: true,
              agents: [{ id: "claude-code" }],
            },
          });
          expect(context.promptState.selectAgentsCalls).toEqual([]);
          expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
          expect(context.exists("axm.json")).toBe(true);
          expect(context.exists("axm-lock.yaml")).toBe(true);
        }),
    );
  });

  describe("axm login", () => {
    const signedInUnattended = () =>
      makeLoginSpecContext({
        machine: true,
        flags: { nonInteractive: true, json: true },
        validSession: true,
      });

    it.effect("a valid session without approval is kept as an already-signed-in no-op", () =>
      Effect.gen(function* () {
        const context = signedInUnattended();

        yield* handleLogin({ yes: false, deviceCode: true, scopes: [] }).pipe(
          Effect.provide(context.layer),
        );

        expect(context.deviceFlowStarts).toEqual([]);
        expect(yield* context.storedAccessToken).toBe(EXISTING_ACCESS_TOKEN);
        expect(context.rendererState.results.at(-1)?.data).toEqual({
          result: {
            status: "already-logged-in",
            registryHost: LOGIN_REGISTRY_HOST,
            handle: EXISTING_HANDLE,
          },
        });
      }),
    );

    it.effect("the same request with approval starts a new sign-in", () =>
      Effect.gen(function* () {
        const context = signedInUnattended();

        yield* handleLogin({ yes: true, deviceCode: true, scopes: [] }).pipe(
          Effect.provide(context.layer),
        );

        expect(context.deviceFlowStarts).toHaveLength(1);
        expect(context.rendererState.results.at(-1)?.data).toMatchObject({
          result: { status: "pending-human", userCode: DEVICE_USER_CODE },
        });
      }),
    );
  });
});
