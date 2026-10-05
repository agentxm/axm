import type { InstalledSkill } from "@agentxm/workspace-features/lifecycle";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import { AgentId, type SkillInstallEvent } from "./__generated__/telemetry-client.js";

type InstallProperties = SkillInstallEvent["properties"];
const repositoryPattern = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/;
const PublicRepository = Schema.Struct({
  private: Schema.Literal(false),
  visibility: Schema.Literal("public"),
  full_name: Schema.String.check(Schema.isPattern(repositoryPattern)),
});

/** Acquisition retains the original transport URL; analytics keeps only canonical coordinates. */
const githubRepository = (url: URL): Option.Option<string> => {
  if (
    url.hostname.toLowerCase() !== "github.com" ||
    url.port !== "" ||
    !["https:", "http:", "ssh:", "git:"].includes(url.protocol)
  )
    return Option.none();
  const repository = url.pathname
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/\.git$/, "");
  return repositoryPattern.test(repository) &&
    !repository.endsWith("/.") &&
    !repository.endsWith("/..")
    ? Option.some(repository)
    : Option.none();
};

const validSkillPath = (value: string): boolean =>
  value.length <= 1024 &&
  !/^[A-Za-z]:/.test(value) &&
  (value === "." ||
    (value.split("/").every((part) => part !== "" && part !== "." && part !== "..") &&
      value.split("/").at(-1) !== "SKILL.md")) &&
  [...value].every(
    (character) =>
      character !== "\\" && character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
  );

/** Invocation-local memo, discarded with its reporter. No persisted visibility evidence. */
export const makeSkillInstallEligibility = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const probes = yield* Ref.make(new Map<string, Effect.Effect<Option.Option<string>>>());
  const publicRepository = (repository: string) =>
    Effect.gen(function* () {
      const key = repository.toLowerCase();
      const probe = yield* Effect.cached(
        Effect.gen(function* () {
          const response = yield* http.execute(
            HttpClientRequest.get(`https://api.github.com/repos/${key}`, {
              headers: { accept: "application/vnd.github+json" },
            }),
          );
          if (response.status !== 200) return Option.none<string>();
          const metadata = yield* Schema.decodeUnknownEffect(PublicRepository)(
            yield* response.json,
          );
          if (metadata.full_name.toLowerCase() !== key) return Option.none<string>();
          return Option.some(`https://github.com/${metadata.full_name}`);
        }).pipe(Effect.catchCause(() => Effect.succeed(Option.none<string>()))),
      );
      const selected = yield* Ref.modify(probes, (memo) => {
        const existing = memo.get(key);
        return existing === undefined ? [probe, new Map(memo).set(key, probe)] : [existing, memo];
      });
      return yield* selected;
    });

  return (
    installed: InstalledSkill,
    preview: boolean,
  ): Effect.Effect<Option.Option<InstallProperties>> =>
    Effect.gen(function* () {
      const { ref, scope, installKind } = installed;
      const targetAgents = [...new Set(installed.targetAgents)].flatMap((agent) => {
        const decoded = Schema.decodeUnknownResult(AgentId)(agent);
        return Result.isSuccess(decoded) ? [decoded.success] : [];
      });
      if (ref.refType === "registry") {
        const url = ref.source.location;
        if (
          ref.visibility !== "public" ||
          url.origin !== "https://registry.agentxm.ai" ||
          (url.pathname !== "/" && url.pathname !== "")
        )
          return Option.none();
        return Option.some({
          skill: {
            kind: "registry",
            registryUrl: "https://registry.agentxm.ai",
            publisherBindingId: ref.publisherBindingId,
            extensionType: "skill",
            packageName: ref.name,
          },
          revision: {
            kind: "registry",
            version: ref.version,
            ...(Option.isSome(ref.integrity) ? { integrity: ref.integrity.value } : {}),
          },
          scope,
          installKind,
          targetAgents,
        });
      }
      if (
        ref.refType !== "git-hosted" ||
        ref.sourcePath === undefined ||
        !validSkillPath(ref.sourcePath) ||
        preview
      )
        return Option.none();
      const repository = githubRepository(ref.source.url);
      if (Option.isNone(repository)) return Option.none();
      const repositoryUrl = yield* publicRepository(repository.value);
      if (Option.isNone(repositoryUrl)) return Option.none();
      return Option.some({
        skill: { kind: "git", repositoryUrl: repositoryUrl.value, skillPath: ref.sourcePath },
        revision: { kind: "git", commitSha: ref.gitCommitSha },
        scope,
        installKind,
        targetAgents,
      });
    });
});
