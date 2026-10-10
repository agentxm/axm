import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import { probeFlag } from "../../test-support/parser-probe.js";

export const specification = defineSpecification({
  requirement: "cli/install/mcp-inputs-belong-to-typed-route",
  title: "MCP distribution and binding inputs belong to MCP installation",
  statement:
    "Root install shall reject the MCP-specific --bind, --bind-env, --distribution, --native-oauth, and --as options, while mcps install shall accept them. Root install shall accept the --mcp-server source selector and reject --mcp; this selector identifies extensions to install without configuring their native bindings.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "machine-automation"],
  methods: ["contract", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("MCP installation options", () => {
  it.effect.each(["--bind", "--bind-env", "--distribution", "--native-oauth", "--as"])(
    "%s is registered only on the MCP route",
    (flag) =>
      Effect.gen(function* () {
        expect(yield* probeFlag(["install"], flag)).toBe("unrecognized");
        expect(yield* probeFlag(["mcps", "install"], flag)).toBe("accepted");
      }),
  );
  it.effect("keeps the canonical source selector", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["install"], "--mcp-server")).toBe("accepted");
      expect(yield* probeFlag(["install"], "--mcp")).toBe("unrecognized");
    }),
  );
});
