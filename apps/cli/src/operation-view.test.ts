import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  makeOperationResolution,
  operationPresentation,
  StepFailure,
  type JobStepArtifact,
  type Plan,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";

import { operationDoc, planDoc } from "./operation-view.js";
import { paintText } from "./screen/paint-text.js";
import { asciiGlyphs } from "./screen/glyphs.js";

const paint = (doc: ReturnType<typeof planDoc>): string =>
  paintText(doc, { width: 160, colors: false, glyphs: asciiGlyphs }).join("\n");

describe("pack membership output", () => {
  const artifact: JobStepArtifact = {
    path: "packs/toolkit/pack.json",
    scope: "project",
    change: "updated",
    packMembership: {
      pack: "@acme/packs/toolkit",
      members: [
        { member: "@acme/skills/added", before: null, after: ">=1.0.0" },
        { member: "@acme/skills/removed", before: ">=2.0.0", after: null },
        { member: "@acme/skills/updated", before: ">=1.0.0", after: ">=2.0.0" },
      ],
    },
  };
  it.each(["preview", "apply"] as const)(
    "renders resolved member and constraint changes for %s",
    (mode) => {
      const plan: Plan = {
        _tag: "Plan",
        name: "Change membership",
        description: Option.none(),
        jobs: [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "toolkit",
                artifact,
                run: Effect.succeed({ result: "success", message: "Updated toolkit", artifact }),
              },
            ],
          },
        ],
      };
      const resolution = makeOperationResolution({
        name: plan.name,
        description: plan.description,
        mode,
        atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
        units: [{ id: "toolkit", label: "toolkit", state: "committed", artifact }],
      });
      const doc =
        mode === "preview"
          ? planDoc(plan, { mode, verbosity: "normal" })
          : operationDoc(resolution, { verbosity: "normal" });
      const text = paint(doc);
      expect(text).toContain("@acme/packs/toolkit");
      expect(text).toMatch(/\+ {3}@acme\/skills\/added\s+>=1\.0\.0/);
      expect(text).toMatch(/- {3}@acme\/skills\/removed\s+>=2\.0\.0/);
      expect(text).toMatch(/~ {3}@acme\/skills\/updated\s+>=1\.0\.0 to >=2\.0\.0/);
    },
  );
});

describe("source switch output", () => {
  const artifact: JobStepArtifact = {
    path: "agent_extensions/registry/@acme/skills/review",
    scope: "project",
    change: "updated",
    sourceSwitch: {
      before: {
        family: "git",
        locator: "https://example.com/acme/review.git",
        resolution: "commit abc; tree def",
        treeIntegrity: "sha256-tree-v1:before",
      },
      after: {
        family: "registry",
        locator: "https://registry.example.com/",
        resolution: "version 1.0.0",
        treeIntegrity: "sha256-tree-v1:after",
      },
      content: "changed",
      dependencies: { effect: "not-applicable", added: [], removed: [], changed: [] },
      projections: { effect: "reconcile", detail: "Reconcile configured-agent projections" },
      guarantees: { gained: ["publisher epoch", "yank filtering"], lost: [] },
      packMembers: [
        {
          member: "@acme/skills/review",
          disposition: "source-changed",
          before: {
            family: "git",
            locator: "https://example.com/acme/review.git",
            resolution: "commit abc; tree def",
          },
          after: {
            family: "registry",
            locator: "https://registry.example.com/",
            resolution: "version 1.0.0",
          },
        },
      ],
    },
  };

  it.each(["preview", "apply"] as const)("renders source-switch evidence for %s", (mode) => {
    const plan: Plan = {
      _tag: "Plan",
      name: "Switch source",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "warn",
              label: "review",
              warnMessage: "Source authority changes",
              artifact,
              run: Effect.succeed({ result: "success", message: "Switched review", artifact }),
            },
          ],
        },
      ],
    };
    const resolution = makeOperationResolution({
      name: plan.name,
      description: plan.description,
      mode,
      atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
      units: [{ id: "review", label: "review", state: "committed", artifact }],
    });
    const doc =
      mode === "preview"
        ? planDoc(plan, { mode, verbosity: "normal" })
        : operationDoc(resolution, { verbosity: "normal" });
    const text = paint(doc);
    expect(text).toContain("Source: git https://example.com/acme/review.git to registry");
    expect(text).toContain("Content: changed");
    expect(text).toContain("Dependencies: not-applicable");
    expect(text).toContain("Projections: Reconcile configured-agent projections");
    expect(text).toContain("Guarantees: gained publisher epoch, yank filtering; lost none");
    expect(text).toContain(
      "Pack member source-changed: @acme/skills/review; prior git https://example.com/acme/review.git (commit abc; tree def); target registry",
    );
    expect(text).toContain("https://registry.example.com/ (version 1.0.0)");
  });
});

const syncPresentation = operationPresentation({
  imperative: "sync",
  past: "Synced",
  gerund: "Syncing",
});

const artifactOf = (
  change: JobStepArtifact["change"],
  version: string | undefined,
): JobStepArtifact => ({
  path: `agent_extensions/${change}`,
  scope: "project",
  change,
  ...(version === undefined ? {} : { version }),
});

const mixedPlan: Plan = {
  _tag: "Plan",
  name: "Sync workspace",
  description: Option.none(),
  presentation: syncPresentation,
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          readiness: "ready",
          key: "@acme/skills/standup",
          label: "@acme/skills/standup",
          artifact: artifactOf("created", "0.4.2"),
          run: Effect.succeed({ result: "success", message: "installed" }),
        },
        {
          readiness: "ready",
          label: "@acme/skills/triage",
          artifact: artifactOf("updated", "2.0.1"),
          run: Effect.succeed({ result: "success", message: "updated" }),
        },
        {
          readiness: "ready",
          label: "@legacy/skills/changelog",
          artifact: artifactOf("removed", "0.3.0"),
          run: Effect.succeed({ result: "success", message: "removed" }),
        },
        {
          readiness: "ready",
          label: "@acme/skills/kept",
          artifact: artifactOf("unchanged", "1.0.0"),
          run: Effect.succeed({ result: "success", message: "unchanged" }),
        },
      ],
    },
  ],
};

describe("plan ledger", () => {
  it("opens with a title line and closes with a verdict that carries the counts", () => {
    const text = paint(planDoc(mixedPlan, { mode: "preview", verbosity: "normal" }));
    const lines = text.split("\n");
    expect(lines[0]).toBe("Previewing sync  in this project");
    expect(lines.at(-1)).toBe("Would sync 3 extensions  1 already current - no changes made");
  });

  it("marks each unit with its own change and folds the ones already current", () => {
    const text = paint(planDoc(mixedPlan, { mode: "preview", verbosity: "normal" }));
    expect(text).toContain("Extension");
    expect(text).toMatch(/\+ {3}@acme\/skills\/standup\s+0\.4\.2\s+install/);
    expect(text).toMatch(/~ {3}@acme\/skills\/triage\s+2\.0\.1\s+update/);
    expect(text).toMatch(/- {3}@legacy\/skills\/changelog\s+0\.3\.0\s+remove/);
    expect(text).toMatch(/= {3}1 extension already current\s+--verbose to list/);
    expect(text).not.toContain("@acme/skills/kept");
  });

  it("lists the folded units instead of folding them at verbose level", () => {
    const text = paint(planDoc(mixedPlan, { mode: "preview", verbosity: "verbose" }));
    expect(text).toContain("@acme/skills/kept");
    expect(text).not.toContain("--verbose to list");
  });

  it("takes each row id from the plan layer, never from the label alone", () => {
    const doc = planDoc(mixedPlan, { mode: "preview", verbosity: "normal" });
    const ledger = doc.find((node) => node._tag === "ledger");
    expect(ledger?._tag === "ledger" ? ledger.rows.map((row) => row.id) : []).toEqual([
      "@acme/skills/standup",
      "@acme/skills/triage",
      "@legacy/skills/changelog",
    ]);
  });
});

const resolutionOf = (units: ReadonlyArray<ResolvedUnit<never>>) =>
  makeOperationResolution({
    name: "Sync workspace",
    description: Option.none(),
    mode: "apply",
    presentation: syncPresentation,
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
    units,
  });

describe("result ledger", () => {
  it("puts the verdict after the ledger, where it needs no glyph of its own", () => {
    const text = paint(
      operationDoc(
        resolutionOf([
          {
            id: "@acme/skills/triage",
            label: "@acme/skills/triage",
            state: "committed",
            artifact: { ...artifactOf("updated", "2.0.1"), agents: ["claude-code", "codex"] },
          },
        ]),
        { verbosity: "normal" },
      ),
    );
    const lines = text.split("\n");
    // Where the operation acted and for which agents is stated once, on the
    // title line, rather than repeated as a trailing aside.
    expect(lines[0]).toBe("Syncing  in this project - agents: claude-code, codex");
    expect(lines.at(-1)).toBe("Synced 1 extension");
    expect(text).toMatch(/~ {3}@acme\/skills\/triage\s+2\.0\.1\s+updated/);
  });

  it("states a no-op as the verdict alone, with no ledger and no title above it", () => {
    const doc = operationDoc(resolutionOf([]), { verbosity: "normal" });
    expect(doc.map((node) => node._tag)).toEqual(["headline"]);
    expect(paint(doc)).toBe(" ok  Nothing to sync");
  });

  it("reports what it left unchanged after the ledger rather than in a row", () => {
    const text = paint(
      operationDoc(
        resolutionOf([
          {
            id: "@acme/subagents/reviewer",
            label: "@acme/subagents/reviewer",
            state: "committed",
            artifact: {
              ...artifactOf("removed", "0.9.0"),
              references: [
                { path: "AGENTS.md", state: "retained", reason: "prose AXM did not write" },
              ],
            },
          },
        ]),
        { verbosity: "normal" },
      ),
    );
    expect(text).toContain("1 existing item was left unchanged");
    expect(text).toContain("AGENTS.md, prose AXM did not write");
    expect(text).not.toMatch(/- {3}@acme\/subagents\/reviewer.*AGENTS\.md/);
  });

  it("keeps the outcome and drops the narration around it under quiet", () => {
    const doc = operationDoc(
      resolutionOf([
        {
          id: "@acme/skills/triage",
          label: "@acme/skills/triage",
          state: "committed",
          artifact: artifactOf("updated", "2.0.1"),
        },
      ]),
      { verbosity: "quiet" },
    );
    expect(doc.some((node) => node._tag === "headline" && node.tone === "neutral")).toBe(false);
    expect(paint(doc)).toContain("Synced 1 extension");
  });
});

describe("problem outcomes", () => {
  const notTried = (id: string): ResolvedUnit<never> => ({
    id,
    label: id,
    state: "blocked",
    message: "not attempted: the operation was interrupted",
    blocking: {
      class: "operation-aborted",
      subject: id,
      phase: "apply",
      detail: "not attempted: the operation was interrupted",
    },
  });

  it("settles an interruption into rolled-back and not-tried rows with the exit code", () => {
    const text = paint(
      operationDoc(
        makeOperationResolution({
          ...resolutionOf([
            {
              id: "@acme/skills/triage",
              label: "@acme/skills/triage",
              state: "interrupted",
              disposition: "restored",
              artifact: artifactOf("created", "2.0.1"),
              message: "interrupted while in flight; effects were restored",
            },
            notTried("@acme/skills/standup"),
          ]),
          interruption: { signal: "SIGINT", disposition: "restored" },
        }),
        { verbosity: "normal" },
      ),
    );
    expect(text).toMatch(
      /< {3}@acme\/skills\/triage\s+2\.0\.1\s+rolled back\n\s+interrupted in flight/,
    );
    // A unit the operation stopped before says what stopped it, beneath its row.
    expect(text).toMatch(
      /\. {3}@acme\/skills\/standup\s+-\s+not tried\n\s+not attempted: the operation was interrupted/,
    );
    expect(text.split("\n").at(-1)).toBe(
      "Interrupted - changes rolled back  1 rolled back - 1 not tried - exit 130",
    );
  });

  it("states a blocked operation as a marked callout with its reason and recoveries", () => {
    const doc = operationDoc(
      makeOperationResolution({
        ...resolutionOf([
          {
            id: "@acme/skills/standup",
            label: "@acme/skills/standup",
            state: "ready",
            artifact: artifactOf("created", "0.4.2"),
          },
        ]),
        blocking: {
          class: "approval-required",
          subject: "Sync workspace",
          phase: "confirmation",
          detail: "This plan removes extensions another agent still uses.",
        },
      }),
      {
        verbosity: "normal",
        suggestions: [{ description: "Approve it up front", cmd: "axm sync --yes" }],
      },
    );
    expect(doc.map((node) => node._tag)).toEqual(["headline", "ledger", "callout", "next"]);
    const text = paint(doc);
    expect(text).toMatch(/\. {3}@acme\/skills\/standup\s+0\.4\.2\s+not tried/);
    expect(text).toContain(
      " !!  Sync is blocked - approval is required   1 not tried, exit 2\n     This plan removes extensions another agent still uses.",
    );
    expect(text).toContain("axm sync --yes   Approve it up front");
  });

  it("follows a failed verdict with its reason and the exit code its cause class sets", () => {
    const text = paint(
      operationDoc(
        makeOperationResolution({
          ...resolutionOf([
            {
              id: "@acme/skills/standup",
              label: "@acme/skills/standup",
              state: "failed",
              artifact: artifactOf("created", "0.4.2"),
              message: "registry returned 502",
            },
          ]),
          failure: new StepFailure({
            category: "network",
            detail: "The registry could not be reached.",
          }),
        }),
        { verbosity: "normal" },
      ),
    );
    // The unit's own reason stands beneath its row; the operation's follows the verdict.
    expect(text).toMatch(
      /xx {2}@acme\/skills\/standup\s+0\.4\.2\s+failed[^\n]*\n\s+registry returned 502/,
    );
    expect(text.split("\n").slice(-2)).toEqual([
      "Failed to sync 1 extension  1 failed - exit 8",
      "The registry could not be reached.",
    ]);
  });
});
