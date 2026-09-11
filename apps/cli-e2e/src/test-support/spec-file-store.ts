/**
 * Native filesystem store and local-package fixtures for end-to-end
 * specifications.
 *
 * The in-process CLI harness composes the same shapes over a memory
 * filesystem; a built-CLI specification always writes to the real disk the
 * spawned process reads, so only the native half lives here.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** One directory entry, as the store reports it. */
export interface SpecDirectoryEntry {
  readonly name: string;
  readonly type: "file" | "directory" | "symlink";
}

/**
 * The synchronous file operations a fixture needs. Declared here rather than
 * imported: an end-to-end project observes only shipped artifacts.
 */
export interface SpecFileStore {
  readonly exists: (target: string) => boolean;
  readonly makeDirectory: (target: string) => void;
  readonly makeTempDirectory: (prefix: string) => string;
  readonly readDirectory: (target: string) => ReadonlyArray<SpecDirectoryEntry>;
  readonly readFile: (target: string) => Uint8Array;
  readonly readFileString: (target: string) => string;
  readonly readLink: (target: string) => string;
  readonly realPath: (target: string) => string;
  readonly remove: (target: string) => void;
  readonly type: (target: string) => "file" | "directory" | "symlink" | undefined;
  readonly writeFile: (target: string, content: string | Uint8Array) => void;
}

export interface SpecWorkspaceStorage {
  readonly root: string;
  readonly files: SpecFileStore;
}

export type SpecWorkspaceInput = string | SpecWorkspaceStorage;

const makeNativeFileStore = (): SpecFileStore => ({
  exists: fs.existsSync,
  makeDirectory: (target) => void fs.mkdirSync(target, { recursive: true }),
  makeTempDirectory: (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))),
  readDirectory: (target) =>
    fs.readdirSync(target, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      type: entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : "file",
    })),
  readFile: (target) => new Uint8Array(fs.readFileSync(target)),
  readFileString: (target) => fs.readFileSync(target, "utf8"),
  readLink: fs.readlinkSync,
  realPath: fs.realpathSync,
  remove: (target) => void fs.rmSync(target, { recursive: true, force: true }),
  type: (target) => {
    try {
      const entry = fs.lstatSync(target);
      if (entry.isSymbolicLink()) return "symlink";
      return entry.isDirectory() ? "directory" : "file";
    } catch {
      return undefined;
    }
  },
  writeFile: fs.writeFileSync,
});

export const resolveSpecWorkspaceStorage = (workspace: SpecWorkspaceInput): SpecWorkspaceStorage =>
  typeof workspace === "string" ? { root: workspace, files: makeNativeFileStore() } : workspace;

export interface LocalSkillFixture {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly owner?: string;
  readonly body?: string;
}

/**
 * Writes a local skill package (manifest plus `src/SKILL.md`) under
 * `<workspaceRoot>/vendor/<name>` and returns its absolute path for use as an
 * install source.
 */
export const writeLocalSkillPackage = (
  workspace: SpecWorkspaceInput,
  fixture: LocalSkillFixture,
): string => {
  const { root: workspaceRoot, files } = resolveSpecWorkspaceStorage(workspace);
  const packageRoot = path.join(workspaceRoot, "vendor", fixture.name);
  files.makeDirectory(packageRoot);
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  files.writeFile(
    path.join(packageRoot, "skill.json"),
    `${JSON.stringify(
      {
        $schema: "https://axm.sh/schemas/skill.schema.json",
        owner: fixture.owner ?? "@acme",
        type: "skill",
        name: fixture.name,
        version: fixture.version ?? "1.0.0",
        description,
      },
      null,
      2,
    )}\n`,
  );
  files.makeDirectory(path.join(packageRoot, "src"));
  files.writeFile(
    path.join(packageRoot, "src", "SKILL.md"),
    `---\nname: "${fixture.name}"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n\n${fixture.body ?? description}\n`,
  );
  return packageRoot;
};
