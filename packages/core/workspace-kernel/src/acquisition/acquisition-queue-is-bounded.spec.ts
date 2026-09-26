import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { defineSpecification } from "@agentxm/specification-metadata";

import { MAX_QUEUED_ACQUISITIONS, selectAcquisitionQueue } from "./acquisition-queue.js";

export const specification = defineSpecification({
  requirement: "workspace/acquisition-queue-is-bounded",
  title: "One candidate has a finite source acquisition queue",
  statement:
    "AXM shall deduplicate external source acquisitions and refuse a candidate whose distinct acquisition count exceeds a finite operation limit before fetching content or taking the workspace transition.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "A synthetic candidate's source refs make deduplication, the admitted queue length, and early refusal directly observable without network or workspace effects.",
  methods: ["boundary-value", "example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const name = decodeExtensionNameSync("example");
const sourceRef: SkillExtensionRef = {
  type: "skill",
  refType: "local",
  name,
  skill: { name, description: Option.none(), metadata: Option.none() },
  source: { type: "local", path: "/source" },
  location: "file:///source/0",
};

describe("Bounded source acquisition queue", () => {
  it("admits the scale fixture and refuses the next distinct source", () => {
    const refs = Array.from({ length: MAX_QUEUED_ACQUISITIONS + 1 }, (_, index) => ({
      ...sourceRef,
      location: `file:///source/${index}`,
    }));
    const admitted = selectAcquisitionQueue(refs.slice(0, MAX_QUEUED_ACQUISITIONS));
    expect(admitted.type).toBe("ready");
    if (admitted.type === "ready") expect(admitted.refs).toHaveLength(MAX_QUEUED_ACQUISITIONS);

    expect(selectAcquisitionQueue(refs)).toEqual({
      type: "limit",
      limit: MAX_QUEUED_ACQUISITIONS,
    });
  });

  it("deduplicates repeated refs before applying the limit", () => {
    const refs = Array.from({ length: MAX_QUEUED_ACQUISITIONS + 1 }, () => sourceRef);
    const selected = selectAcquisitionQueue(refs);
    expect(selected.type).toBe("ready");
    if (selected.type === "ready") expect(selected.refs).toEqual([sourceRef]);
  });
});
