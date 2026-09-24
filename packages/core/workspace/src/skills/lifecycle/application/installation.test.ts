import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { prepareSkillInstallation, type SkillInstallationFacts } from "./installation.js";

it.effect(
  "another delivery can prepare skill policy and read artifact evidence only after realization",
  () =>
    Effect.gen(function* () {
      const content = yield* Ref.make(
        Option.none<{ readonly fileCount: number; readonly sourceHash: string }>(),
      );
      const name = decodeExtensionNameSync("review");
      const ref: SkillExtensionRef = {
        type: "skill",
        refType: "registry",
        owner: decodeHandleSync("@example"),
        name,
        version: decodeVersionSync("1.2.0"),
        integrity: Option.none(),
        publisherBindingId: "hbnd_example",
        packages: [],
        source: {
          type: "registry",
          name: "example",
          location: new URL("https://registry.example.test"),
          owner: Option.none(),
        },
        skill: { name, description: Option.none(), metadata: Option.none() },
      };
      const facts: SkillInstallationFacts<string, never, never> = {
        inspect: () =>
          Effect.succeed({
            installed: false,
            previousVersion: undefined,
            sourceHash: undefined,
            scope: "project",
            displayPath: "skills/review",
            agents: ["recipient"],
            unknownAgents: ["unknown-recipient"],
            unavailableAgents: [],
            targets: [{ path: "skills/review", agentIds: ["recipient"], state: "absent" }],
          }),
        releaseAge: () => Effect.succeed(Option.some({ minimumAge: "24h", mature: false })),
        readContent: () =>
          Ref.get(content).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail("Content has not been realized"),
                onSome: Effect.succeed,
              }),
            ),
          ),
      };

      const prepared = yield* prepareSkillInstallation(facts, { ref });
      expect(prepared.warnings).toEqual([
        "@example/skills/review@1.2.0 was published less than 24h ago — installing it because you requested this version explicitly",
        "Skipping unknown configured agents: unknown-recipient",
      ]);
      yield* Ref.set(content, Option.some({ fileCount: 3, sourceHash: "realized-content" }));
      expect(
        yield* prepared.buildArtifact({ installedBefore: prepared.installedBefore }),
      ).toMatchObject({
        change: "created",
        version: "1.2.0",
        fileCount: 3,
        targets: [{ path: "skills/review", agentIds: ["recipient"], change: "created" }],
      });
    }),
);
