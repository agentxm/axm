import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { captureHelpDoc } from "../../test-support/command-tree-test-helpers.js";
import { probeFlag, probeFlags } from "../../test-support/parser-probe.js";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";

export const specification = defineSpecification({
  requirement: "cli/update/typed-selectors-are-unambiguous",
  title: "Typed updates distinguish exact sources from repeated local-name filters",
  statement:
    "Every typed update command shall expose --source for an exact source-only selector, positional names for installed names or globs, and --reinstall for reacquisition. No typed update shall expose --name or --refresh. Root update shall expose --reinstall and reject --refresh; no install route shall expose --reinstall.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "workspace-intent-fidelity"],
  methods: ["contract", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const routes = ["skills", "subagents", "rules", "hooks", "knowledge", "mcps", "packs"] as const;
describe("Typed update grammar", () => {
  for (const route of routes)
    it.effect(`axm ${route} update uses named selectors`, () =>
      Effect.gen(function* () {
        const path = [route, "update"];
        const help = toJsonHelpDoc(yield* captureHelpDoc(path));
        expect(help.args).toContainEqual(
          expect.objectContaining({ name: "name", required: false, variadic: { min: 0 } }),
        );
        expect(help.flags).toContainEqual(
          expect.objectContaining({ name: "source", required: false }),
        );
        expect(help.flags).toContainEqual(expect.objectContaining({ name: "reinstall" }));
        expect(yield* probeFlags(path, ["--source", "owner/repo", "--reinstall"])).toBe("accepted");
        expect(yield* probeFlag(path, "--name")).toBe("unrecognized");
        expect(yield* probeFlag(path, "--refresh")).toBe("unrecognized");
      }),
    );
  it.effect("root update exposes reinstall and retires refresh", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["update"], "--reinstall")).toBe("accepted");
      expect(yield* probeFlag(["update"], "--refresh")).toBe("unrecognized");
    }),
  );
});
