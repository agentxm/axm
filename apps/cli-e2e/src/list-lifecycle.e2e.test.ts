import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as Schema from "effect/Schema";
import { expect, it } from "vitest";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { snapshotTree } from "@agentxm/test-support";
import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { publishExtension } from "./test-support/registry-workspace.js";

export const executionBinding = defineExecutionBinding({
  requirements: [
    "cli/list/filters-registry-lifecycle",
    "cli/list/ordinary-inventory-is-local",
    "cli/list/rejects-incompatible-filters",
  ],
  boundary: "process",
  rationale:
    "The built CLI publishes and installs fixture packages in a file Registry, then observes independent and combined lifecycle flags, separate JSON metadata, type filtering, invalid combinations, workspace purity, and ordinary listing after the Registry is removed.",
});

const LifecycleDocument = Schema.Struct({
  filter: Schema.String,
  count: Schema.Number,
  items: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      assessment: Schema.Struct({
        state: Schema.String,
        archival: Schema.optional(
          Schema.Struct({ archivedAt: Schema.String, message: Schema.String }),
        ),
        deprecation: Schema.optional(
          Schema.Struct({
            deprecatedAt: Schema.String,
            reason: Schema.String,
            message: Schema.String,
            replacement: Schema.Struct({ status: Schema.String, fqn: Schema.String }),
          }),
        ),
      }),
    }),
  ),
});

const decodeLifecycleResult = Schema.decodeUnknownSync(
  Schema.Struct({ ok: Schema.Literal(true), result: LifecycleDocument }),
);

it("lists archived and deprecated installations independently or as a union", async () => {
  const fixture = makeDirectoryFixture();
  try {
    const registry = path.join(fixture.root, "registry");
    const registryLocation = pathToFileURL(registry).href;
    fs.writeFileSync(
      path.join(fixture.invoking, "axm.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        minimumReleaseAge: "0s",
        defaultRegistry: "test",
        sources: [{ name: "test", type: "registry", location: registryLocation }],
      }),
    );
    const archival = { archivedAt: "2026-03-02T00:00:00.000Z", message: "Publication is closed." };
    const deprecation = {
      deprecatedAt: "2026-03-01T00:00:00.000Z",
      reason: "superseded",
      message: "Use the replacement.",
      replacement: { status: "available", fqn: "@acme/skills/active" },
    };
    for (const item of [
      { name: "active", plural: "skills", archival: null, deprecation: null },
      { name: "archived", plural: "rules", archival, deprecation: null },
      { name: "deprecated", plural: "skills", archival: null, deprecation },
      { name: "both", plural: "skills", archival, deprecation },
    ]) {
      await publishExtension({
        registryLocation,
        owner: "@acme",
        plural: item.plural,
        name: item.name,
      });
      const installed = await fixture.run([
        "install",
        `@acme/${item.plural}/${item.name}`,
        "--non-interactive",
        "--json",
      ]);
      expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
      const indexPath = path.join(
        registry,
        "extensions",
        "@acme",
        item.plural,
        item.name,
        "index.json",
      );
      const index = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
        JSON.parse(fs.readFileSync(indexPath, "utf8")),
      );
      fs.writeFileSync(
        indexPath,
        JSON.stringify({ ...index, archival: item.archival, deprecation: item.deprecation }),
      );
    }
    const before = snapshotTree(fixture.invoking);
    for (const query of [
      { flags: ["--archived"], filter: "archived", names: ["archived", "both"] },
      { flags: ["--deprecated"], filter: "deprecated", names: ["both", "deprecated"] },
      {
        flags: ["--deprecated", "--archived"],
        filter: "lifecycle",
        names: ["archived", "both", "deprecated"],
      },
      {
        flags: ["--archived", "--deprecated", "--type", "skill"],
        filter: "lifecycle",
        names: ["both", "deprecated"],
      },
    ]) {
      const result = await fixture.run(["list", ...query.flags, "--json"]);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const { result: document } = decodeLifecycleResult(JSON.parse(result.stdout));
      expect(document.filter).toBe(query.filter);
      expect(document.count).toBe(query.names.length);
      expect(document.items.map((item) => item.name).sort()).toEqual(query.names);
      expect(document.items.find((item) => item.name === "both")?.assessment).toMatchObject({
        archival,
        deprecation,
      });
    }
    const human = await fixture.run(["list", "--deprecated", "--archived"]);
    expect(human.exitCode, human.stdout + human.stderr).toBe(0);
    expect(human.stdout).toContain("deprecated, archived");
    const invalid = await fixture.run(["list", "--outdated", "--archived", "--json"]);
    expect(invalid.exitCode).toBe(2);
    const error: unknown = JSON.parse(invalid.stdout);
    expect(error).toMatchObject({ ok: false, code: "usage" });
    expect(snapshotTree(fixture.invoking)).toEqual(before);
    fs.rmSync(registry, { recursive: true });
    const local = await fixture.run(["list", "--json"]);
    expect(local.exitCode, local.stdout + local.stderr).toBe(0);
    const { result: document } = decodeLifecycleResult(JSON.parse(local.stdout));
    expect(document.count).toBe(4);
    expect(
      document.items.every((item) => JSON.stringify(item.assessment) === '{"state":"not-checked"}'),
    ).toBe(true);
  } finally {
    fixture.cleanup();
  }
});
