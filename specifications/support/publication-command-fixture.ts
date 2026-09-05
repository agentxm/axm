import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { PublishResultSchema, writeWorkspaceFiles } from "axm.sh/specification-harness";
import { makeDirectoryFixture } from "./directory-harness.js";
import {
  makeFileRegistry,
  writeAuthoredSkill,
  writeAuthoredMcpServer,
  writeAuthoredSubagent,
  writeAuthoredRule,
  writeAuthoredHook,
  writeAuthoredKnowledge,
  writeAuthoredPack,
} from "./publish-harness.js";

export const publicationTypes = [
  { route: "skills", write: writeAuthoredSkill },
  { route: "mcps", write: writeAuthoredMcpServer },
  { route: "subagents", write: writeAuthoredSubagent },
  { route: "rules", write: writeAuthoredRule },
  { route: "hooks", write: writeAuthoredHook },
  { route: "knowledge", write: writeAuthoredKnowledge },
  { route: "packs", write: writeAuthoredPack },
] as const;
export type PublicationType = (typeof publicationTypes)[number];

/** Runs the registered CLI against authored packages and distinct local Registry destinations. */
export const makePublicationCommandFixture = (type: PublicationType) => {
  const fixture = makeDirectoryFixture();
  const selected = makeFileRegistry(path.join(fixture.root, "selected-target"));
  const distractor = makeFileRegistry(path.join(fixture.root, "other-target"));
  const foreign = type.route === "skills" ? "rules" : "skills";
  writeWorkspaceFiles(fixture.selected, {
    owner: "@acme",
    agents: [],
    sources: [
      { name: "distractor", type: "registry", location: distractor.url },
      { name: "selected", type: "registry", location: selected.url },
    ],
    [type.route]: { review: "workspace", redwood: "workspace", unrelated: "workspace" },
    [foreign]: { review: "workspace" },
  });
  for (const name of ["review", "redwood", "unrelated"]) type.write(fixture.selected, { name });
  if (foreign === "rules") writeAuthoredRule(fixture.selected, { name: "review" });
  else writeAuthoredSkill(fixture.selected, { name: "review" });
  const run = (command: ReadonlyArray<string>, flags: ReadonlyArray<string>) =>
    fixture.run(["-C", fixture.selected, ...command, ...flags, "--non-interactive", "--json"]);
  return {
    selected,
    distractor,
    foreign,
    run,
    selectedArchives: () => selected.storedFiles().filter((file) => file.endsWith(".zip")),
    archiveBytes: (relative: string) => {
      // The directory helper uses real file Registry storage, not a captured upload list.
      const absolute = new URL(`./${relative}`, `${selected.url}/`);
      return fs.readFileSync(absolute);
    },
    cleanup: fixture.cleanup,
  };
};

const PublicationDocument = Schema.Struct({ result: PublishResultSchema });
export const readPublicationCommandResult = (stdout: string) =>
  Schema.decodeUnknownSync(PublicationDocument)(JSON.parse(stdout)).result;
