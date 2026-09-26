import * as Option from "effect/Option";
import type {
  GitHostedSkillRef,
  SkillExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";

const gitHostedSourceOrigin = (ref: GitHostedSkillRef): string => {
  return ref.source.url.href;
};

export const gitHostedSkillArtifactSource = (ref: SkillExtensionRef) => {
  if (ref.refType !== "git-hosted") return undefined;

  const gitTreeHash = ref.gitTreeSha;
  const gitRef = Option.getOrUndefined(ref.source.ref);
  const directory =
    ref.sourcePath === undefined || ref.sourcePath.length === 0 ? "." : ref.sourcePath;

  return {
    type: ref.source.type,
    origin: gitHostedSourceOrigin(ref),
    ...(gitRef !== undefined ? { ref: gitRef } : {}),
    directory,
    gitTreeHash,
  };
};
