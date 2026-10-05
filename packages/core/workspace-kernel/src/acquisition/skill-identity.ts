/** Native identity uses the exact content selected for this transition. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { fromFileLocation } from "@agentxm/host-primitives";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import { readSkillDirectoryName } from "../workspace-state/index.js";
import { acquiredFilesForRef } from "./acquired-content.js";

export const skillDirectoryNameForRef = (ref: SkillExtensionRef) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const acquired = yield* acquiredFilesForRef(ref, "on-disk");
    const packageRoot = Option.orElse(acquired.pipe(Option.map((files) => files.directory)), () =>
      ref.refType === "registry" ? Option.none() : Option.some(fromFileLocation(ref.location)),
    );
    // Registry content may not have been acquired during preview. Do not guess
    // a native name from the package name or inspect an older installed version.
    if (Option.isNone(packageRoot)) return Option.none<string>();
    const contentRoot =
      "portable" in ref && ref.portable === true
        ? path.join(packageRoot.value, ref.distribution?.componentPath ?? ".")
        : path.join(packageRoot.value, "src");
    return Option.some(yield* readSkillDirectoryName(contentRoot, ref.skill.name));
  });
