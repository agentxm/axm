/** Real file-Registry Subagent archives shared by trust and preview evidence. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SpecRegistry } from "./registry-fixture.js";

const OWNER = "@acme";
const PUBLISHED_AT = "1960-01-01T00:00:00Z";

export interface RegistrySubagentVersion {
  readonly version: string;
  readonly body: string;
}

/**
 * Publish the complete version list for one subagent into the file Registry
 * with the layout the production resolver reads: a per-extension index plus
 * one archive per version. Publication predates the deterministic test clock,
 * so every version is immediately eligible.
 */
export const writeRegistrySubagent = (
  registry: SpecRegistry,
  name: string,
  versions: ReadonlyArray<RegistrySubagentVersion>,
  publisherBindingId: string,
): void => {
  const subagentDir = path.join(registry.root, "extensions", OWNER, "subagents", name);
  fs.mkdirSync(subagentDir, { recursive: true });
  const entries = versions.map(({ version, body }) => {
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-subagent-"));
    const archivePath = path.join(subagentDir, `${version}.zip`);
    try {
      fs.mkdirSync(path.join(stagingDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(stagingDir, "subagent.json"),
        `${JSON.stringify(
          { owner: OWNER, type: "subagent", name, version, description: `The ${name} subagent.` },
          null,
          2,
        )}\n`,
      );
      fs.writeFileSync(
        path.join(stagingDir, "src", `${name}.md`),
        `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n${body}\n`,
      );
      execFileSync("zip", ["-qr", archivePath, "subagent.json", "src"], { cwd: stagingDir });
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    const archive = fs.readFileSync(archivePath);
    return {
      version,
      published: PUBLISHED_AT,
      integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    };
  });
  fs.writeFileSync(
    path.join(subagentDir, "index.json"),
    `${JSON.stringify(
      {
        owner: OWNER,
        type: "subagent",
        name,
        publisherBindingId,
        deprecation: null,
        versions: entries,
      },
      null,
      2,
    )}\n`,
  );
};
