import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import type { DesiredStateGraph } from "@agentxm/workspace-kernel/workspace-state";
import { expandCheckScope, type CheckSubject } from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/check/includes-required-contributors",
  title: "Selected checks include their required contributors",
  statement:
    "A selected local check shall include declared pack members and contributors connected through shared semantic output or package units, preserve their inclusion reasons, retain incomplete membership evidence, and exclude unrelated subjects.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "Scope expansion consumes authoritative graph and contributor observations; native ownership resolution and discovery completeness require separate platform evidence.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const graph: DesiredStateGraph = {
  nodes: [],
  problems: [],
  mcpSourceClosures: [],
  packMembership: [
    {
      settingsName: "engineering",
      pack: "@acme/packs/engineering",
      enabled: true,
      declared: { status: "known", members: [{ type: "rule", name: "review" }] },
      routes: "active",
    },
  ],
};
const review: CheckSubject = { type: "rule", name: "review" };
const guide: CheckSubject = { type: "knowledge", name: "guide" };
const hook: CheckSubject = { type: "hook", name: "check" };

describe("Required assessment contributors", () => {
  it("does not treat an absent pack declaration as an empty pack", () => {
    const result = expandCheckScope({
      selected: [{ type: "pack", name: "unobserved" }],
      graph,
      units: [],
    });
    expect(result.incomplete).toEqual([
      { source: "pack:unobserved", reason: "Pack membership was not observed" },
    ]);
  });
  it("expands transitively across shared units without taking unrelated units", () => {
    const result = expandCheckScope({
      selected: [{ type: "pack", name: "engineering" }],
      graph,
      units: [
        {
          id: "other-region-in-same-file",
          contributors: [{ type: "rule", name: "unrelated" }],
          complete: true,
        },
        { id: "second", contributors: [guide, hook], complete: true },
        { id: "first", contributors: [review, guide], complete: true },
      ],
    });
    expect(result.subjects.map(({ name }) => name)).toEqual([
      "engineering",
      "review",
      "guide",
      "check",
    ]);
    expect(result.subjects.find(({ name }) => name === "review")).toMatchObject({
      requested: false,
      includedBy: expect.arrayContaining([{ kind: "pack-member", source: "pack:engineering" }]),
    });
    expect(result.units).toEqual(["first", "second"]);
    expect(result.incomplete).toEqual([]);
  });

  it("retains selected intent and all inclusion reasons through overlapping cycles", () => {
    const result = expandCheckScope({
      selected: [review, review],
      graph,
      units: [
        { id: "first", contributors: [review, guide], complete: true },
        { id: "second", contributors: [guide, review], complete: true },
      ],
    });
    expect(result.subjects).toHaveLength(2);
    expect(result.subjects[0]).toEqual({
      ...review,
      requested: true,
      includedBy: [
        { kind: "shared-output", source: "first" },
        { kind: "shared-output", source: "second" },
      ],
    });
  });

  it("keeps missing pack and shared contributor evidence incomplete", () => {
    const result = expandCheckScope({
      selected: [{ type: "pack", name: "missing" }, review],
      graph: {
        ...graph,
        packMembership: [
          {
            settingsName: "missing",
            pack: "@acme/packs/missing",
            enabled: true,
            declared: { status: "unknown", reason: "unreadable" },
            routes: "unknown",
          },
        ],
      },
      units: [{ id: "instructions", contributors: [review], complete: false }],
    });
    expect(result.incomplete).toEqual([
      { source: "pack:missing", reason: "unreadable" },
      { source: "instructions", reason: "Shared-output contributor evidence is incomplete" },
    ]);
    expect(result.subjects).toHaveLength(2);
  });
});
