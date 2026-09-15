import * as Option from "effect/Option";
import type {
  GitHostedSkillRef,
  SkillExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";

const gitHostedSourceOrigin = (ref: GitHostedSkillRef): string => {
  const source = ref.source;
  switch (source.type) {
    case "github":
    case "gitlab":
    case "bitbucket":
      return `${source.url.origin}/${source.owner}/${source.repo}`;
    case "azurerepos":
      return `${source.url.origin}/${source.organization}/${source.project}/_git/${source.repo}`;
    case "git":
      return source.url.href;
  }
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
