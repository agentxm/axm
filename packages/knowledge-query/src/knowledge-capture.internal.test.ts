import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { KnowledgeBundleFqnSchema } from "@agentxm/extension-model/unstable/knowledge/concept-ref";
import { captureKnowledgeIndexBundles } from "./knowledge-capture.js";
import { makeKnowledgeIndexSnapshot, queryKnowledgeIndex } from "./knowledge-index.js";
import { makeKnowledgeQuery } from "./knowledge-query.js";

layer(NodeServices.layer, { excludeTestServices: true })("Knowledge corpus capture", (it) => {
  it.effect("parses and fingerprints the exact bytes from one consistent live capture", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(
        path.join(root, "index.md"),
        '---\nokf_version: "0.2"\n---\n# Platform\n\n- [Start](start.md)\n',
      );
      yield* fs.writeFileString(
        path.join(root, "start.md"),
        "---\ntype: guide\ndescription: Start here\ntags: [authentication]\n---\n# Start\n\nAuthentication details.\n",
      );
      const bundle = Schema.decodeUnknownSync(KnowledgeBundleFqnSchema)(
        "@agentxm/knowledge/platform",
      );

      const captured = yield* captureKnowledgeIndexBundles([
        { bundle, version: "1.0.0", sourceRoot: root },
      ]);
      const snapshot = makeKnowledgeIndexSnapshot(captured);
      const result = queryKnowledgeIndex(
        snapshot,
        makeKnowledgeQuery("project", [{ kind: "term", value: "authentication" }]),
        0,
      );

      expect(captured[0]?.sources).toHaveLength(2);
      expect(snapshot.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(result.items.map(({ ref }) => ref.conceptId)).toEqual(["start"]);
    }).pipe(Effect.scoped),
  );
});
