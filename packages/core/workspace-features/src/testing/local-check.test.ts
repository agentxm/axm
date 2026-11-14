import { lintSelectedSubjects } from "../linting/index.js";
import { SyncWorkspace } from "../sync/index.js";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { WorkspaceInvariantFacts } from "@agentxm/workspace-kernel/projection";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  assessCapturedCheck,
  captureLocalCheck,
  checkLocal,
  LocalCheckDocumentSchema,
} from "../inspection/index.js";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { applySync, expectResolved, makeSyncFixture } from "./sync-fixture.js";

const owners = {
  lint: lintSelectedSubjects,
  convergence: SyncWorkspace.assessLocalMaterialization,
};

it.effect("distinguishes an unmanaged path from an assessed AXM package", () => {
  const workspace = makeSyncFixture({ files: { "notes.md": "Unmanaged notes\n" } });
  return workspace
    .provide(
      Effect.gen(function* () {
        const before = workspace.snapshot();
        const result = yield* checkLocal(
          {
            selection: { kind: "paths", paths: ["notes.md"] },
            checks: ["compatibility", "ownership", "lint", "convergence"],
            strict: false,
            userHome: workspace.home,
          },
          owners,
        );
        expect(result.verdict.ok).toBe(true);
        expect(result.selection.requests[0]?.resolution).toBe("resolved");
        expect(result.scope.subjects).toEqual([]);
        expect(result.assessments.find(({ kind }) => kind === "ownership")).toMatchObject({
          coverage: { state: "complete" },
          conclusion: "satisfied",
        });
        for (const assessment of result.assessments.filter(({ kind }) => kind !== "ownership")) {
          expect(assessment.coverage).toEqual({
            state: "not-applicable",
            reason: "Selected paths have no established AXM package or materialization owner.",
          });
          expect(assessment.conclusion).toBe("not-applicable");
        }
        expect(workspace.snapshot()).toEqual(before);
      }),
    )
    .pipe(
      Effect.provide(
        Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      ),
      Effect.ensuring(Effect.sync(workspace.cleanup)),
    );
});

it.effect("marks lint-only evidence incomplete when an owner observes a source change", () => {
  const manifest = {
    type: "skill",
    owner: "@acme",
    name: "review",
    version: "1.0.0",
    description: "Review code",
  };
  const workspace = makeSyncFixture({
    settings: { owner: "@acme", agents: [], skills: { review: { source: "workspace" } } },
    files: {
      "skills/review/skill.json": JSON.stringify(manifest),
      "skills/review/src/SKILL.md": "---\nname: review\ndescription: Review code\n---\n# Review\n",
    },
  });
  return workspace
    .provide(
      Effect.gen(function* () {
        const result = yield* checkLocal(
          {
            selection: { kind: "identities", identities: ["review"] },
            checks: ["lint"],
            strict: false,
            userHome: workspace.home,
          },
          {
            ...owners,
            // Simulate an independent editor, then an owner's read through
            // the provided view. Both versions are valid; only the known
            // inconsistent observation may fail this assessment.
            lint: (args) =>
              args.platform.fs.readFile(`${workspace.root}/skills/review/skill.json`).pipe(
                Effect.andThen(
                  Effect.sync(() =>
                    workspace.writeFile(
                      "skills/review/skill.json",
                      JSON.stringify({
                        ...manifest,
                        description: "Changed by another editor during assessment",
                      }),
                    ),
                  ),
                ),
                Effect.andThen(
                  args.platform.fs.readFile(`${workspace.root}/skills/review/skill.json`),
                ),
                Effect.andThen(owners.lint(args)),
              ),
          },
        );
        expect(result.findings.filter(({ severity }) => severity === "error")).toEqual([]);
        expect(result.inspection.observationDiagnostics).toContainEqual(
          expect.objectContaining({ code: "inspection-read-changed" }),
        );
        expect(result.assessments.find(({ kind }) => kind === "lint")?.coverage.state).toBe(
          "incomplete",
        );
        expect(result.assessments.find(({ kind }) => kind === "ownership")?.coverage.state).toBe(
          "not-requested",
        );
        expect(result.verdict.ok).toBe(false);
      }),
    )
    .pipe(
      Effect.provide(
        Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      ),
      Effect.ensuring(Effect.sync(workspace.cleanup)),
    );
});

it.effect("applies pack distribution lint only to the selected pack closure", () => {
  const workspace = makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code", "adal"],
      skills: { private: { source: "workspace", distribute: false } },
      packs: { shared: { source: "workspace" }, empty: { source: "workspace" } },
    },
    files: {
      "skills/private/skill.json": JSON.stringify({
        type: "skill",
        owner: "@acme",
        name: "private",
        version: "1.0.0",
        description: "Private skill",
      }),
      "skills/private/src/SKILL.md":
        "---\nname: private\ndescription: Private skill\n---\n# Private\n",
      ...Object.fromEntries(
        ["shared", "empty"].map((name) => [
          `packs/${name}/pack.json`,
          JSON.stringify({
            type: "pack",
            owner: "@acme",
            name,
            version: "1.0.0",
            description: "Pack",
            dependencies: name === "shared" ? { "@acme/skills/private": "*" } : {},
          }),
        ]),
      ),
    },
  });
  return workspace
    .provide(
      Effect.gen(function* () {
        const before = workspace.snapshot();
        for (const name of ["shared", "empty"]) {
          const document = yield* checkLocal(
            {
              selection: { kind: "identities", identities: [name] },
              agents: ["claude-code"],
              checks: ["lint"],
              strict: false,
              userHome: workspace.home,
            },
            owners,
          );
          const findings = document.findings.filter(
            ({ ruleId }) => ruleId === "workspace/packs-shared-members-distributable",
          );
          expect(findings).toHaveLength(name === "shared" ? 1 : 0);
          expect(document.verdict.ok).toBe(name === "empty");
          expect(document.scope.incomplete).toEqual([]);
          expect(
            document.inspection.requests.every(({ resolution }) => resolution === "resolved"),
          ).toBe(true);
        }
        expect(workspace.snapshot()).toEqual(before);
        workspace.writeSettings({
          owner: "@acme",
          agents: ["claude-code", "adal"],
          skills: { private: { source: "workspace", distribute: true } },
          packs: { shared: { source: "workspace" }, empty: { source: "workspace" } },
        });
        const corrected = yield* checkLocal(
          {
            selection: { kind: "identities", identities: ["shared"] },
            agents: ["claude-code"],
            checks: ["lint"],
            strict: false,
            userHome: workspace.home,
          },
          owners,
        );
        expect(corrected.verdict.ok).toBe(true);
        const member = corrected.inspection.items.find(({ identity }) => identity.type === "skill");
        expect(member?.agentOutcomes.length).toBeGreaterThan(0);
        expect(member?.agentOutcomes.every(({ agentId }) => agentId === "claude-code")).toBe(true);
      }),
    )
    .pipe(
      Effect.provide(
        Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      ),
      Effect.ensuring(Effect.sync(workspace.cleanup)),
    );
});

it.effect(
  "uses the official skill policy only when the selected closure includes that skill",
  () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@agentxm",
        agents: [],
        skills: { axm: { source: "workspace" }, review: { source: "workspace" } },
      },
      files: Object.fromEntries(
        ["axm", "review"].flatMap((name) => [
          [
            `skills/${name}/skill.json`,
            JSON.stringify({
              type: "skill",
              owner: "@agentxm",
              name,
              version: "1.0.0",
              description: "Authored skill",
            }),
          ],
          [
            `skills/${name}/src/SKILL.md`,
            `---\nname: ${name}\ndescription: Authored skill\n---\n# Skill\n`,
          ],
        ]),
      ),
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const unrelated = yield* captureLocalCheck(
            {
              selection: { kind: "identities", identities: ["review"] },
              checks: ["compatibility"],
              strict: false,
              userHome: workspace.home,
            },
            owners,
          );
          expect(unrelated.officialCompatibility).toBeUndefined();
          expect(
            assessCapturedCheck(unrelated, { checks: ["compatibility"], strict: false }).verdict.ok,
          ).toBe(true);
          const selected = yield* captureLocalCheck(
            {
              selection: { kind: "identities", identities: ["axm"] },
              checks: ["compatibility"],
              strict: false,
              userHome: workspace.home,
            },
            owners,
          );
          expect(selected.officialCompatibility).toMatchObject({
            _tag: "assessed",
            compatibility: { status: "incompatible" },
          });
          expect(
            assessCapturedCheck(selected, { checks: ["compatibility"], strict: false }).verdict.ok,
          ).toBe(false);
        }),
      )
      .pipe(
        Effect.provide(
          Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
        ),
        Effect.ensuring(Effect.sync(workspace.cleanup)),
      );
  },
);

it.effect(
  "composes selected evidence without applying and refreshes it after an authored edit",
  () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        skills: { review: { source: "workspace" } },
      },
      files: {
        "skills/review/skill.json": JSON.stringify({
          type: "skill",
          owner: "@acme",
          name: "review",
          version: "1.0.0",
          description: "Review code",
        }),
        "skills/review/src/SKILL.md":
          "---\nname: review\ndescription: Review code\n---\n# Review\n",
      },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const first = yield* captureLocalCheck(
            {
              selection: { kind: "identities", identities: ["review"] },
              checks: ["lint", "convergence"],
              strict: false,
              userHome: workspace.home,
            },
            owners,
          );
          expect(first.selection.requests[0]?.resolution).toBe("resolved");
          expect(first.scope.subjects.map(({ name }) => name)).toEqual(["review"]);
          expect(first.compatibility).toBeUndefined();
          expect(first.failedOwners).toEqual([]);
          const firstResult = assessCapturedCheck(first, {
            checks: ["lint", "convergence"],
            strict: false,
          });
          expect(firstResult.verdict.ok).toBe(false);
          expect(
            firstResult.assessments.find(({ kind }) => kind === "convergence")?.conclusion,
          ).toBe("attention-required");
          expect(
            firstResult.assessments.find(({ kind }) => kind === "compatibility")?.coverage.state,
          ).toBe("not-requested");
          expect(first.lint !== undefined && Result.isSuccess(first.lint)).toBe(true);
          expect(first.convergence !== undefined && Result.isSuccess(first.convergence)).toBe(true);
          if (first.convergence !== undefined && Result.isSuccess(first.convergence)) {
            expect(first.convergence.success.steps.length).toBeGreaterThan(0);
          }
          expect(workspace.snapshot()).toEqual(before);
          const applied = expectResolved(yield* applySync());
          expect(deriveOperationOutcome(applied)).toBe("applied");
          const synchronized = workspace.snapshot();
          const current = yield* checkLocal(
            {
              selection: { kind: "identities", identities: ["review"] },
              checks: ["compatibility", "ownership", "lint", "convergence"],
              strict: false,
              userHome: workspace.home,
            },
            owners,
          );
          expect(current.verdict.ok).toBe(true);
          expect(current.reconciliation).toEqual([]);
          expect(workspace.snapshot()).toEqual(synchronized);
          workspace.writeFile(
            "skills/review/skill.json",
            JSON.stringify({
              type: "skill",
              owner: "@acme",
              name: "review",
              version: "invalid",
              description: "Review code",
            }),
          );
          const after = workspace.snapshot();
          const second = yield* captureLocalCheck(
            {
              selection: { kind: "identities", identities: ["review"] },
              checks: ["lint"],
              strict: false,
              userHome: workspace.home,
            },
            owners,
          );
          expect(second.convergence).toBeUndefined();
          expect(second.lint !== undefined && Result.isSuccess(second.lint)).toBe(true);
          if (second.lint !== undefined && Result.isSuccess(second.lint)) {
            expect(second.lint.success.findings.some(({ severity }) => severity === "error")).toBe(
              true,
            );
          }
          const secondResult = assessCapturedCheck(second, { checks: ["lint"], strict: false });
          expect(secondResult.verdict.ok).toBe(false);
          expect(secondResult.assessments.find(({ kind }) => kind === "lint")?.conclusion).toBe(
            "attention-required",
          );
          expect(secondResult.verdict.reasons.some(({ code }) => code === "error-finding")).toBe(
            true,
          );
          expect(workspace.snapshot()).toEqual(after);
        }),
      )
      .pipe(
        Effect.provide(
          Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
        ),
        Effect.ensuring(Effect.sync(workspace.cleanup)),
      );
  },
);

it.effect(
  "recognizes selected inline MCP configuration as linted without requiring package files or writing state",
  () => {
    const workspace = makeSyncFixture({
      settings: {
        agents: [],
        mcpServers: {
          clean: {
            connection: {
              transport: "stdio",
              command: "node",
              env: { API_TOKEN: { env: "API_TOKEN" } },
            },
          },
          other: { connection: { transport: "stdio", command: "node" } },
        },
      },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();
          const clean = yield* captureLocalCheck(
            {
              selection: { kind: "identities", identities: ["clean"] },
              checks: ["lint"],
              strict: true,
              userHome: workspace.home,
            },
            owners,
          );
          const cleanResult = assessCapturedCheck(clean, { checks: ["lint"], strict: true });
          expect(cleanResult.findings).toEqual([]);
          expect(cleanResult.verdict.ok).toBe(true);
          expect(clean.lint !== undefined && Result.isSuccess(clean.lint)).toBe(true);
          if (clean.lint !== undefined && Result.isSuccess(clean.lint)) {
            expect(clean.lint.success.inlineSubjects).toEqual([
              { type: "mcp-server", name: "clean" },
            ]);
            expect(clean.lint.success.observedPackages).toEqual([]);
          }
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(
        Effect.provide(
          Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
        ),
        Effect.ensuring(Effect.sync(workspace.cleanup)),
      );
  },
);

it.effect(
  "does not turn unavailable projection output into incomplete lint contributor coverage",
  () => {
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents: [], rules: { review: { source: "workspace" } } },
      files: {
        "rules/review/rule.json": JSON.stringify({
          type: "rule",
          name: "review",
          owner: "@acme",
          version: "1.0.0",
          title: "Review",
          description: "Review changes",
        }),
        "rules/review/src/RULE.md": "Record review risks.\n",
      },
    });
    // The projection-owner seam simulates an output read failure while retaining
    // the graph's known contributor authority; package reads use the real filesystem.
    const facts = Effect.succeed([
      {
        predicate: "workspace/projection-current",
        subject: { unitId: "rule:instructions-region", path: "AGENTS.md", scope: "project" },
        authority: {
          source: "desired-state-graph",
          contributors: ["workspace:@acme/rules/review"],
        },
        observation: { status: "unavailable" },
        expectation: { status: "current", contributors: ["workspace:@acme/rules/review"] },
      },
    ] satisfies ReadonlyArray<
      import("@agentxm/workspace-kernel/projection").ProjectionInvariantFact
    >);
    const program = Effect.gen(function* () {
      const document = yield* checkLocal(
        {
          selection: { kind: "identities", identities: ["review"] },
          checks: ["lint"],
          strict: false,
          userHome: workspace.home,
        },
        owners,
      );
      expect(document.scope.incomplete).toEqual([]);
      expect(document.verdict.ok).toBe(true);
      const decoded = Schema.decodeUnknownSync(LocalCheckDocumentSchema)(
        JSON.parse(JSON.stringify(document)),
      );
      expect(decoded.projections).toMatchObject([
        {
          authority: { contributors: ["workspace:@acme/rules/review"] },
          observation: { status: "unavailable" },
        },
      ]);
    }).pipe(
      Effect.provideService(WorkspaceInvariantFacts, {
        projectionFacts: facts,
        projectionFactsForGraph: () => facts,
      }),
    );
    return workspace
      .provide(program)
      .pipe(
        Effect.provide(
          Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
        ),
        Effect.ensuring(Effect.sync(workspace.cleanup)),
      );
  },
);

it.effect(
  "keeps agent incompatibility separate from missing projection and unrequested checks",
  () => {
    const workspace = makeSyncFixture({
      settings: {
        agents: ["claude-code", "adal"],
        mcpServers: { probe: { connection: { transport: "stdio", command: "node" } } },
      },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const request = {
            selection: { kind: "identities", identities: ["probe"] },
            checks: ["compatibility"],
            strict: false,
            userHome: workspace.home,
          } satisfies import("../inspection/index.js").LocalCheckRequest & {
            readonly userHome: string;
          };
          const selected = yield* captureLocalCheck(request, owners);
          expect(selected.inspection.items[0]?.agentOutcomes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ agentId: "adal", outcome: "unsupported" }),
            ]),
          );
          expect(assessCapturedCheck(selected, request).verdict.ok).toBe(false);
          const supported = yield* captureLocalCheck(
            { ...request, agents: ["claude-code"] },
            owners,
          );
          expect(assessCapturedCheck(supported, request).verdict.ok).toBe(true);
          const lintOnly = yield* captureLocalCheck({ ...request, checks: ["lint"] }, owners);
          expect(
            assessCapturedCheck(lintOnly, { checks: ["lint"], strict: false }).verdict.ok,
          ).toBe(true);
        }),
      )
      .pipe(
        Effect.provide(
          Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
        ),
        Effect.ensuring(Effect.sync(workspace.cleanup)),
      );
  },
);
