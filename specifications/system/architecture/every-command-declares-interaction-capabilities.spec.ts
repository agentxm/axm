import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import {
  collectHelpFiles,
  registeredCommandCapabilities,
  rootCommand,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  COMMAND_ROUTE_ALLOCATION,
  PREAPPROVAL_ROUTES,
  PREVIEW_ROUTES,
  formatRoute,
} from "../../support/command-routes.js";

export const specification = defineSpecification({
  requirement: "system/architecture/every-command-declares-interaction-capabilities",
  title:
    "Every registered command declares interaction capabilities its flags and evidence agree with",
  statement:
    "Every registered command node shall declare its interaction capabilities; the declared routes shall be exactly the accepted allocation, each declaration shall agree with its allocation row and with the flags its rendered help lists, every assessment route shall own a preview-purity specification, and every advance-approval route shall have a purpose fixture in the confirmation-flag specification.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the registered command tree, the accepted allocation table, the rendered help, and the specification files on disk, compared together, can show that every route's declaration, grammar, and evidence correspond.",
  methods: ["contract", "static"],
  derivedFrom: [
    "system/architecture/specification-folders-mirror-command-tree",
    "cli/confirmation-flags-have-a-supported-purpose",
    "cli/preview-uses-the-canonical-flag",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const specificationsRoot = path.join(repoRoot, "specifications");
const PURPOSE_SPECIFICATION = "cli/confirmation-flags-have-a-supported-purpose.spec.ts";
const REQUIREMENT_LITERAL = /requirement:\s*"([^"]+)"/u;

const allocationBySpelling = new Map(
  COMMAND_ROUTE_ALLOCATION.map((route) => [formatRoute(route.path), route] as const),
);

const registered = registeredCommandCapabilities(rootCommand);

describe("Command interaction capability declarations", () => {
  it("every registered command node declares its interaction capabilities", () => {
    const undeclared = registered
      .filter((entry) => entry.capabilities === undefined)
      .map((entry) => formatRoute(entry.path));
    expect(undeclared).toEqual([]);
    expect(registered.length).toBeGreaterThan(100);
  });

  it("the registered tree and the accepted allocation name the same routes", () => {
    const registeredSpellings = registered.map((entry) => formatRoute(entry.path)).sort();
    const allocated = [...allocationBySpelling.keys()].sort();
    expect(registeredSpellings).toEqual(allocated);
  });

  it("each declaration agrees with its allocation row", () => {
    const disagreements: Array<string> = [];
    for (const entry of registered) {
      const spelling = formatRoute(entry.path);
      const row = allocationBySpelling.get(spelling);
      const capabilities = entry.capabilities;
      if (row === undefined || capabilities === undefined) continue;
      if (capabilities.preview !== row.preview) {
        disagreements.push(`${spelling}: declares preview ${capabilities.preview}`);
      }
      if ((capabilities.preapproval !== null) !== row.preapproval) {
        disagreements.push(
          `${spelling}: declares preapproval ${capabilities.preapproval !== null}`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });

  it.effect("rendered help lists exactly the flags each declaration names", () =>
    Effect.gen(function* () {
      const helpFiles = yield* collectHelpFiles();
      const disagreements: Array<string> = [];
      for (const entry of registered) {
        const spelling = formatRoute(entry.path);
        const capabilities = entry.capabilities;
        if (capabilities === undefined) continue;
        const doc = helpFiles.get(spelling);
        if (doc === undefined) {
          disagreements.push(`${spelling}: no rendered help`);
          continue;
        }
        const flags = new Set(doc.flags.map((flag) => `--${flag.name}`));
        if (flags.has("--preview") !== capabilities.preview) {
          disagreements.push(
            `${spelling}: help ${flags.has("--preview") ? "lists" : "omits"} --preview`,
          );
        }
        if (flags.has("--yes") !== (capabilities.preapproval !== null)) {
          disagreements.push(`${spelling}: help ${flags.has("--yes") ? "lists" : "omits"} --yes`);
        }
        for (const mode of capabilities.modes ?? []) {
          if (!flags.has(mode.flag)) {
            disagreements.push(`${spelling}: declared mode ${mode.flag} is not a parsed flag`);
          }
        }
      }
      expect(disagreements).toEqual([]);
    }),
  );

  it("every assessment route owns a preview-purity specification under its command folder", () => {
    const missing: Array<string> = [];
    for (const route of PREVIEW_ROUTES) {
      const identity = ["cli", ...route.path, "preview-is-pure"].join("/");
      const source = path.join(specificationsRoot, `${identity}.spec.ts`);
      if (!fs.existsSync(source)) {
        missing.push(`${formatRoute(route.path)}: ${identity}.spec.ts is absent`);
        continue;
      }
      const declared = REQUIREMENT_LITERAL.exec(fs.readFileSync(source, "utf8"))?.[1];
      if (declared !== identity) {
        missing.push(`${formatRoute(route.path)}: declares ${declared ?? "no identity"}`);
      }
    }
    expect(missing).toEqual([]);
    expect(PREVIEW_ROUTES.length).toBeGreaterThan(60);
  });

  it("every advance-approval route has a purpose fixture in the confirmation-flag specification", () => {
    const source = fs.readFileSync(path.join(specificationsRoot, PURPOSE_SPECIFICATION), "utf8");
    const unnamed = PREAPPROVAL_ROUTES.map((route) => formatRoute(route.path)).filter(
      (spelling) => !source.includes(`"${spelling}"`),
    );
    expect(unnamed).toEqual([]);
    expect(PREAPPROVAL_ROUTES.length).toBeGreaterThan(0);
  });
});
