/** The fixed thirty-package workspace used by inventory latency and paired output measurements. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

export const prepareInventoryFixture = Effect.fnUntraced(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skills: Record<string, { source: string }> = {};
  const knowledge: Record<string, { source: string }> = {};
  for (let index = 0; index < 30; index++) {
    const type = index < 20 ? "skill" : "knowledge";
    const name = `extension-${index}`;
    const source = `./vendor/${name}`;
    const packageRoot = path.join(root, source);
    yield* fs.makeDirectory(path.join(packageRoot, "src"), { recursive: true });
    yield* fs.writeFileString(
      path.join(packageRoot, `${type}.json`),
      JSON.stringify({
        owner: "@fixture",
        type,
        name,
        version: "1.0.0",
        description: "Inventory performance fixture",
        ...(type === "knowledge"
          ? { format: { name: "okf", version: "0.2" }, bundleRoot: "src" }
          : {}),
      }),
    );
    if (type === "skill") {
      skills[name] = { source };
      yield* fs.writeFileString(
        path.join(packageRoot, "src", "SKILL.md"),
        `---\nname: ${name}\ndescription: Inventory fixture\n---\n# Fixture\n`,
      );
    } else {
      knowledge[name] = { source };
      yield* fs.writeFileString(
        path.join(packageRoot, "src", "index.md"),
        '---\nokf_version: "0.2"\n---\n# Fixture\n',
      );
      for (let document = 0; document < 50; document++)
        yield* fs.writeFileString(
          path.join(packageRoot, "src", `concept-${document}.md`),
          `---\ntype: reference\ndescription: Fixture concept\n---\n# Concept ${document}\n`,
        );
    }
  }
  yield* fs.writeFileString(
    path.join(root, "axm.json"),
    JSON.stringify({ owner: "@fixture", agents: ["claude-code", "codex"], skills, knowledge }),
  );
});
