import { describe, expect, it } from "@effect/vitest";

import { checkSpecificationCorpus, lintProductLanguage } from "./conformance.js";
import {
  decodeExecutionBinding,
  decodeProductGoalRegistry,
  decodeSpecificationMetadata,
} from "./decode.js";
import { defineSpecification, type SpecificationMetadata } from "./contract.js";
import { sharedProductGoals } from "./shared-goals.js";

const accepted = defineSpecification({
  requirement: "cli/install/realizes-direct-intent",
  title: "Install realizes directly desired extensions",
  statement:
    "When a person installs an extension directly, the workspace records that intent and realizes it for every configured agent.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const localGoals = {
  "workspace-intent-fidelity": {
    outcome: "Workspace state always reflects explicitly expressed intent.",
  },
};

const corpus = (
  specifications: readonly SpecificationMetadata[],
  overrides: Partial<Parameters<typeof checkSpecificationCorpus>[0]> = {},
) =>
  checkSpecificationCorpus({
    specifications: specifications.map((metadata) => ({
      source: `specifications/${metadata.requirement}.spec.ts`,
      metadata,
    })),
    localGoals,
    localGoalsSource: "specifications/product-goals.ts",
    ...overrides,
  });

describe("decodeSpecificationMetadata", () => {
  it("accepts a complete accepted specification", () => {
    const result = decodeSpecificationMetadata(accepted);
    expect(result.ok).toBe(true);
  });

  it("requires a characteristic for a quality specification", () => {
    const result = decodeSpecificationMetadata({ ...accepted, class: "quality" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join("\n")).toContain("characteristic");
    }
  });

  it("requires a boundary rationale outside memory", () => {
    const result = decodeSpecificationMetadata({ ...accepted, boundary: "repository" });
    expect(result.ok).toBe(false);
    expect(
      decodeSpecificationMetadata({
        ...accepted,
        boundary: "repository",
        boundaryRationale: "Reads the committed tree that in-memory execution cannot observe.",
      }).ok,
    ).toBe(true);
  });

  it("states unknown assumptions explicitly instead of omitting them", () => {
    const { assumptions: _assumptions, ...withoutAssumptions } = accepted;
    expect(decodeSpecificationMetadata(withoutAssumptions).ok).toBe(false);
    expect(decodeSpecificationMetadata({ ...accepted, assumptions: "unknown" }).ok).toBe(true);
  });

  it("rejects an unknown class or role", () => {
    expect(decodeSpecificationMetadata({ ...accepted, class: "usability" }).ok).toBe(false);
    expect(decodeSpecificationMetadata({ ...accepted, role: "internal" }).ok).toBe(false);
  });

  it("rejects a lifecycle status field; presence on main is the only authority", () => {
    expect(decodeSpecificationMetadata({ ...accepted, status: "accepted" }).ok).toBe(false);
  });

  it("rejects a requirement identity with fewer than two segments", () => {
    expect(decodeSpecificationMetadata({ ...accepted, requirement: "install" }).ok).toBe(false);
  });
});

describe("decodeProductGoalRegistry and decodeExecutionBinding", () => {
  it("accepts the shared registry", () => {
    expect(decodeProductGoalRegistry(sharedProductGoals).ok).toBe(true);
  });

  it("rejects a goal without an outcome", () => {
    expect(decodeProductGoalRegistry({ "a-goal": {} }).ok).toBe(false);
  });

  it("requires a rationale on an execution binding", () => {
    expect(
      decodeExecutionBinding({ requirements: ["cli/x"], boundary: "process", rationale: "" }).ok,
    ).toBe(false);
  });
});

describe("checkSpecificationCorpus", () => {
  it("reports no issues for a conformant corpus", () => {
    const issues = corpus([
      accepted,
      {
        ...accepted,
        requirement: "cli/sync/realizes-desired-state",
        goals: ["workspace-intent-fidelity"],
      },
    ]);
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("rejects a dangling goal reference", () => {
    const issues = corpus([{ ...accepted, goals: ["no-such-goal"] }]);
    expect(issues.map((issue) => issue.message)).toContainEqual(
      expect.stringContaining("unregistered product goal `no-such-goal`"),
    );
  });

  it("rejects a local goal that redefines a shared identity", () => {
    const issues = corpus([accepted], {
      localGoals: { "extension-adoption": { outcome: "duplicate" } },
    });
    expect(issues.map((issue) => issue.message)).toContainEqual(
      expect.stringContaining("shared goal"),
    );
  });

  it("flags a reference to a retired goal as a retirement candidate", () => {
    const issues = corpus([{ ...accepted, goals: ["workspace-intent-fidelity"] }], {
      localGoals: {
        "workspace-intent-fidelity": { outcome: "Retired outcome.", status: "retired" },
      },
    });
    expect(issues.map((issue) => issue.message)).toContainEqual(
      expect.stringContaining("retirement candidate"),
    );
  });

  it("rejects a successor whose superseded predecessor is still present", () => {
    const issues = corpus([
      accepted,
      {
        ...accepted,
        requirement: "cli/install/records-and-realizes-direct-intent",
        supersedes: ["cli/install/realizes-direct-intent"],
      },
    ]);
    expect(issues.map((issue) => issue.message)).toContainEqual(
      expect.stringContaining("still present in the corpus"),
    );
  });

  it("rejects duplicate identities and unknown execution-binding targets", () => {
    const issues = corpus([accepted, accepted], {
      executionBindings: [
        {
          source: "packages/cli-e2e/src/install.e2e.test.ts",
          binding: {
            requirements: ["cli/install/missing"],
            boundary: "process",
            rationale: "Observes the built CLI process.",
          },
        },
      ],
    });
    const messages = issues.map((issue) => issue.message);
    expect(messages).toContainEqual(expect.stringContaining("duplicate requirement identity"));
    expect(messages).toContainEqual(expect.stringContaining("unknown requirement"));
  });

  it("warns about active goals with no referencing specification", () => {
    const issues = corpus([accepted]);
    const unreferenced = issues.filter(
      (issue) => issue.severity === "warning" && issue.message.includes("no referencing"),
    );
    expect(unreferenced.map((issue) => issue.message)).toContainEqual(
      expect.stringContaining("workspace-intent-fidelity"),
    );
  });

  it("warns when a specification declares only unverifiable methods", () => {
    const issues = corpus([{ ...accepted, methods: ["manual", "review"] }]);
    expect(issues.map((issue) => issue.message)).toContainEqual(
      expect.stringContaining("unverified"),
    );
  });

  it("lints titles and statements for implementation vocabulary", () => {
    expect(lintProductLanguage("Install handler realizes intent")).toContain("handler");
    expect(lintProductLanguage("Install uses installHandler")).toContain("camelCase");
    expect(lintProductLanguage("Install realizes directly desired extensions")).toBeUndefined();
    const issues = corpus([{ ...accepted, statement: "The install Layer records intent." }]);
    expect(issues.map((issue) => issue.message)).toContainEqual(
      expect.stringContaining("statement contains implementation vocabulary"),
    );
  });
});
