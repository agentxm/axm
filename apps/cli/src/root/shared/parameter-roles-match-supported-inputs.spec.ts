import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  AGENT_IDS,
  CONFIGURABLE_AGENT_IDS,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { HelpDoc } from "effect/cli/HelpDoc";
import { rootCommand } from "../../app.js";
import { toJsonHelpDoc } from "../../cli-runtime/index.js";
import { collectHelpFiles } from "../../test-support/command-tree-test-helpers.js";
import { parseInvocation, parserRejection } from "../../test-support/parser-probe.js";
import { registeredCommandCapabilities } from "./command-capabilities.js";

export const specification = defineSpecification({
  requirement: "cli/parameters/roles-match-supported-inputs",
  title: "Parameter roles state their supported grammar and effect",
  statement:
    "Agent subjects shall be positional, membership and inspection filters repeatable, and other single-agent roles separately named. Native import shall offer only configurable agents while rendering may offer hosted agents. Type filters for list, publish, and sync shall be repeatable, while view shall accept a single type to disambiguate a bare name. Sync type choices shall exclude packs. Owner flags shall use owner handles and reject all. Selection and advance-approval help shall name their distinct effects. Hook import and creation shall share the supported protocol choices, and hook configuration help shall state its JSON object and secret-reference grammar. Disable routes shall omit --ignore-release-age while enable routes retain it. Cache verification shall declare its application-state writes. Registry selection shall use a single --registry name-or-HTTP(S)-URL input; publication shall reject --registry-url. Native OAuth help shall state its exclusion of an Authorization header.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["contract", "decision-table"],
  derivedFrom: [
    "cli/agent-selection-is-membership-or-filter",
    "cli/confirmation-flags-have-a-supported-purpose",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const types = ["skills", "subagents", "mcps", "rules", "hooks", "knowledge", "packs"];

const helpFor = (files: ReadonlyMap<string, HelpDoc>, path: string) => {
  const document = files.get(path);
  if (document === undefined) throw new Error(`Missing help for ${path}`);
  return toJsonHelpDoc(document);
};

describe("Parameter roles", () => {
  it.effect("states the Authorization-header exclusion for both native OAuth inputs", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const path of ["axm mcps add", "axm mcps install"]) {
        const flag = helpFor(files, path).flags.find(({ name }) => name === "native-oauth");
        expect(flag?.description).toContain("; excludes an Authorization header");
      }
    }),
  );

  it.effect("shares registry selection across root publication, typed publication, and view", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const expected = helpFor(files, "axm view").flags.find(({ name }) => name === "registry");
      expect(expected).toBeDefined();
      for (const group of ["", ...types]) {
        const path = group === "" ? "axm publish" : `axm ${group} publish`;
        const help = helpFor(files, path);
        expect(
          help.flags.find(({ name }) => name === "registry"),
          path,
        ).toEqual(expected);
        expect(
          help.flags.some(({ name }) => name === "registry-url"),
          path,
        ).toBe(false);
        const command = [...(group === "" ? [] : [group]), "publish"];
        const refusal = yield* parserRejection([
          ...command,
          "--registry-url",
          "https://example.test",
        ]);
        expect(JSON.stringify(refusal)).toContain("UnrecognizedOption");
        yield* parseInvocation([...command, "--registry", "https://example.test"]);
      }
      for (const route of [
        "yank",
        "unyank",
        "deprecate",
        "undeprecate",
        "archive",
        "unarchive",
        "visibility status",
        "visibility set",
        "visibility reconcile",
        "login",
        "logout",
        "whoami",
        "token show",
        "token create",
        "token list",
        "token revoke",
      ]) {
        expect(
          helpFor(files, `axm ${route}`).flags.find(({ name }) => name === "registry"),
          route,
        ).toEqual(expected);
      }
      yield* parseInvocation(["view", "@acme/skills/review", "--registry", "https://example.test"]);
    }),
  );

  it.effect("distinguishes agent subjects, filters, import sources, and render targets", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const verb of ["add", "remove", "capabilities"]) {
        const help = helpFor(files, `axm agents ${verb}`);
        expect(help.args).toContainEqual(expect.objectContaining({ name: "id" }));
        expect(help.flags.some(({ name }) => name === "agent")).toBe(false);
      }
      const imports = helpFor(files, "axm subagents import");
      expect(imports.flags.find(({ name }) => name === "source-agent")?.choices).toEqual(
        CONFIGURABLE_AGENT_IDS.map((value) => ({ value })),
      );
      const show = helpFor(files, "axm subagents show");
      expect(show.flags.find(({ name }) => name === "render")?.choices).toEqual(
        AGENT_IDS.map((value) => ({ value })),
      );
      expect(show.flags.find(({ name }) => name === "agent")?.variadic).toBeDefined();
      const refusal = yield* parserRejection([
        "subagents",
        "import",
        "./review.md",
        "@acme/subagents/review",
        "--source-agent",
        "chatgpt",
      ]);
      expect(JSON.stringify(refusal)).toContain("InvalidValue");
    }),
  );

  it.effect("keeps release-age overrides on enable and rejects them on disable", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const group of ["", ...types]) {
        const prefix = group === "" ? "axm" : `axm ${group}`;
        expect(
          helpFor(files, `${prefix} enable`).flags.some(
            ({ name }) => name === "ignore-release-age",
          ),
          prefix,
        ).toBe(true);
        expect(
          helpFor(files, `${prefix} disable`).flags.some(
            ({ name }) => name === "ignore-release-age",
          ),
          prefix,
        ).toBe(false);
        const refusal = yield* parserRejection([
          ...(group === "" ? [] : [group]),
          "disable",
          group === "" ? "@acme/skills/review" : "review",
          "--ignore-release-age",
        ]);
        expect(JSON.stringify(refusal), prefix).toContain("UnrecognizedOption");
      }
    }),
  );

  it.effect("uses repeatable type filters and a single view disambiguator", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const route of ["axm list", "axm publish", "axm sync"]) {
        const type = helpFor(files, route).flags.find(({ name }) => name === "type");
        expect(type?.variadic, route).toBeDefined();
        expect(type?.description, route).toBe("Restrict to this extension type");
      }
      const sync = helpFor(files, "axm sync").flags.find(({ name }) => name === "type");
      expect(sync?.choices).toHaveLength(6);
      expect(sync?.choices).not.toContainEqual({ value: "pack" });
      const view = helpFor(files, "axm view").flags.find(({ name }) => name === "type");
      expect(view?.variadic).toBeUndefined();
      expect(view?.description).toBe("Extension type of a bare name");
    }),
  );

  it.effect("uses the handle grammar on every owner route and rejects the all pseudo-owner", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const routes = [
        ...types.flatMap((type) => [`axm ${type} new`, `axm ${type} publish`]),
        "axm publish",
        "axm token create",
      ];
      expect(routes).toHaveLength(16);
      for (const route of routes) {
        const help = helpFor(files, route);
        const owner = help.flags.find(({ name }) => name === "owner");
        expect(owner, route).toMatchObject({ valueName: "@handle" });
        expect(owner?.variadic !== undefined, route).toBe(!route.endsWith(" new"));
        const argv = route.split(" ").slice(1);
        if (route.endsWith(" new") || route === "axm token create") argv.push("review");
        const refusal = yield* parserRejection([...argv, "--owner", "all"]);
        expect(JSON.stringify(refusal), route).toContain("InvalidValue");
      }
    }),
  );

  it.effect("names selection separately from advance approval", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      for (const route of ["axm install", ...types.map((type) => `axm ${type} install`)]) {
        const help = helpFor(files, route);
        expect(help.flags.find(({ name }) => name === "all")?.description, route).toBe(
          "Select everything the source offers",
        );
      }
      for (const route of ["axm login", "axm setup", "axm demote"]) {
        const help = helpFor(files, route);
        expect(help.flags.find(({ name }) => name === "yes")?.description, route).toMatch(
          /^Approve .+ in advance$/,
        );
      }
      const handoff = helpFor(files, "axm skills handoff");
      expect(handoff.flags.find(({ name }) => name === "skill")?.description).toContain(
        "exact name",
      );
    }),
  );

  it.effect("shares Hook choices, declares defaults, and explains secret configuration", () =>
    Effect.gen(function* () {
      const files = yield* collectHelpFiles();
      const creation = helpFor(files, "axm hooks new").flags.find(
        ({ name }) => name === "protocol",
      );
      const imported = helpFor(files, "axm hooks import").flags.find(
        ({ name }) => name === "protocol",
      );
      expect(creation?.choices).toHaveLength(9);
      expect(creation?.choices).toEqual(imported?.choices);
      expect(creation?.default).toBe("claude-code");
      expect(imported?.default).toBeUndefined();
      expect(imported?.required).toBe(true);
      for (const route of ["install", "test", "configure"]) {
        const help = helpFor(files, `axm hooks ${route}`);
        const configuration = help.flags.find(({ name }) => name === "configuration");
        expect(configuration?.description).toContain(
          "as a JSON object; {env: NAME} references a secret",
        );
        if (route === "test") expect(configuration?.default).toBe("{}");
      }
    }),
  );

  it("declares cache integrity verification as an application-state mutation", () => {
    const route = registeredCommandCapabilities(rootCommand).find(
      ({ path }) => path.join(" ") === "cache verify",
    );
    expect(route?.capabilities?.effect).toBe("application-state");
  });
});
