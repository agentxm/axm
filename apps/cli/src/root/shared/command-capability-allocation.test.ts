import * as fs from "node:fs";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { rootCommand } from "../../app.js";
import { collectHelpFiles } from "../../test-support/command-tree-test-helpers.js";
import { registeredCommandCapabilities } from "./command-capabilities.js";

import {
  COMMAND_ROUTE_ALLOCATION,
  PREAPPROVAL_ROUTES,
  PREVIEW_ROUTES,
  formatRoute,
} from "../../test-support/command-routes.js";
import {
  owningSpecification,
  specificationFileFor,
} from "../../test-support/specification-index.js";

/**
 * Every registered command node declares its interaction capabilities, the
 * declared routes are exactly the accepted allocation, each declaration
 * agrees with its row and with the flags its rendered help lists, every
 * assessment route owns a preview-purity specification, and every
 * advance-approval route has a purpose fixture.
 *
 * Supersedes the retired specification identity
 * `system/architecture/every-command-declares-interaction-capabilities`
 * (see `specifications/disposition-ledger.json`): the allocation table is an
 * inventory of the command tree with no standing outside the maintainers.
 */

const PURPOSE_IDENTITY = "cli/confirmation-flags-have-a-supported-purpose";
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

  it("every assessment route owns a preview-purity specification", () => {
    const missing: Array<string> = [];
    for (const route of PREVIEW_ROUTES) {
      const identity = ["cli", ...route.path, "preview-is-pure"].join("/");
      // The obligation is that the identity is owned exactly once. A
      // specification is authored beside the source it binds, so the file may
      // live under `specifications/` or in its owning package; and an identity
      // a consolidation retired is owned by the successor the disposition
      // ledger names.
      const owner = owningSpecification(identity);
      if (owner === undefined) {
        missing.push(`${formatRoute(route.path)}: no specification declares ${identity}`);
        continue;
      }
      const declared = REQUIREMENT_LITERAL.exec(fs.readFileSync(owner.file, "utf8"))?.[1];
      if (declared !== owner.identity) {
        missing.push(`${formatRoute(route.path)}: declares ${declared ?? "no identity"}`);
      }
    }
    expect(missing).toEqual([]);
    expect(PREVIEW_ROUTES.length).toBeGreaterThan(60);
  });

  it("every advance-approval route has a purpose fixture in the confirmation-flag specification", () => {
    const purposeFile = specificationFileFor(PURPOSE_IDENTITY);
    if (purposeFile === undefined) {
      throw new Error(`No specification declares ${PURPOSE_IDENTITY}`);
    }
    const source = fs.readFileSync(purposeFile, "utf8");
    const unnamed = PREAPPROVAL_ROUTES.map((route) => formatRoute(route.path)).filter(
      (spelling) => !source.includes(`"${spelling}"`),
    );
    expect(unnamed).toEqual([]);
    expect(PREAPPROVAL_ROUTES.length).toBeGreaterThan(0);
  });
});
