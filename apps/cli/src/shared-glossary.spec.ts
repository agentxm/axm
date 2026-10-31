import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Command } from "effect/cli";
import { defineSpecification } from "@agentxm/specification-metadata";
import { HELP_TOPICS } from "./__generated__/help-topics.js";
import { AXM_SKILL_SOURCE_FILES } from "./__generated__/bundled-axm-skill.js";
import { handleHelpPath } from "./root/help/command.js";
import { TestRenderer } from "./test-support/presenter-test.js";

export const specification = defineSpecification({
  requirement: "cli/help/shared-extension-glossary",
  title: "Core consumers carry the shared extension glossary",
  statement:
    "CLI glossary help, the bundled AXM skill reference, and the released website glossary shall preserve the canonical engineering knowledge concept's complete definitions and source identity, version, attribution, and digest; reading CLI help shall require neither a workspace nor installation of the engineering pack.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "Compares shipped generated artifacts with canonical source and invokes the real help handler using only its presentation port.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("shared extension glossary", () => {
  it("preserves the canonical body in every shipped representation", () => {
    const root = resolve(import.meta.dirname, "../../..");
    const source = readFileSync(
      resolve(root, "knowledge/agent-extension-engineering/src/glossary.md"),
      "utf8",
    );
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "").trim();
    const skill = AXM_SKILL_SOURCE_FILES.find((file) => file.path === "references/glossary.md");
    expect(skill).toBeDefined();
    const reference = Buffer.from(skill?.base64 ?? "", "base64").toString("utf8");
    const website = readFileSync(
      resolve(root, "apps/cli/site-content/__generated__/agent-extension-glossary.md"),
      "utf8",
    );
    expect(HELP_TOPICS.glossary).toBe(reference);
    expect(website).toBe(reference);
    expect(reference).toContain(body);
    expect(reference).toContain(createHash("sha256").update(source).digest("hex"));
    expect(reference).toContain("CC-BY-4.0");
  });

  it.effect("reads glossary help without workspace, network, or extension services", () =>
    Effect.gen(function* () {
      const { layer, state } = TestRenderer.make();
      yield* handleHelpPath(["glossary"], Command.make("axm")).pipe(Effect.provide(layer));
      expect(state.markdown).toEqual([HELP_TOPICS.glossary]);
    }),
  );
});
