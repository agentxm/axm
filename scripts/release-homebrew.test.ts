import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  loadHomebrewPublicationToken,
  readHomebrewFormula,
  submitHomebrewFormula,
} from "./release-homebrew.js";
import { PublicationHttpError, SupersededRelease } from "./release-publication.js";

const fixtureToken = "homebrew-publication-fixture";

describe("Homebrew publication reads", () => {
  for (const environment of [{}, { HOMEBREW_TAP_TOKEN: "" }]) {
    it.effect(
      `rejects an absent or empty publication credential: ${JSON.stringify(environment)}`,
      () =>
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            loadHomebrewPublicationToken(ConfigProvider.fromEnvRecord(environment)),
          );
          expect(failure._tag).toBe("ConfigError");
          expect(String(failure)).toContain("HOMEBREW_TAP_TOKEN");
        }),
    );
  }

  it.effect("reads an authenticated formula while keeping configuration redacted", () =>
    Effect.gen(function* () {
      const token = yield* loadHomebrewPublicationToken(
        ConfigProvider.fromEnvRecord({ HOMEBREW_TAP_TOKEN: fixtureToken }),
      );
      expect(JSON.stringify(token)).not.toContain(fixtureToken);
      const formula = 'class Axm < Formula\n  version "0.41.0"\nend\n';
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          expect(request.url).toBe(
            "https://api.github.com/repos/agentxm/homebrew-tap/contents/Formula/axm.rb?ref=main",
          );
          expect(request.headers["authorization"]).toBe(`Bearer ${fixtureToken}`);
          expect(request.headers["cache-control"]).toBe("no-cache");
          return HttpClientResponse.fromWeb(request, new Response(formula));
        }),
      );
      expect(
        yield* readHomebrewFormula(token).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      ).toBe(formula);
    }),
  );

  it.effect("preserves retry metadata without exposing credentials or response bodies", () =>
    Effect.gen(function* () {
      const client = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(fixtureToken, { status: 429, headers: { "retry-after": "2" } }),
          ),
        ),
      );
      const failure = yield* Effect.flip(
        readHomebrewFormula(Redacted.make(fixtureToken)).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      );
      expect(failure).toEqual(
        new PublicationHttpError("Homebrew formula query failed: HTTP 429.", 429, 2000),
      );
      expect(JSON.stringify(failure)).not.toContain(fixtureToken);
    }),
  );

  it.effect("propagates cancellation to an in-flight client request", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const interrupted = yield* Deferred.make<void>();
      const client = HttpClient.make(() =>
        Effect.andThen(Deferred.succeed(started, undefined), Effect.never).pipe(
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
        ),
      );
      const fiber = yield* Effect.forkChild(
        readHomebrewFormula(Redacted.make(fixtureToken)).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        ),
      );
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(yield* Deferred.isDone(interrupted)).toBe(true);
    }),
  );
});

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const formula = (version: string) => `class Axm < Formula\n  version "${version}"\nend\n`;
const botIdentity = "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>";
const fixtureIdentity = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test"];

/** A bare tap remote holding `published` and a fresh clone, isolated from developer Git config. */
const makeTap = (published: string) => {
  const root = mkdtempSync(join(tmpdir(), "axm-homebrew-tap-"));
  directories.push(root);
  const globalConfig = join(root, "global.gitconfig");
  writeFileSync(globalConfig, "");
  const env: Record<string, string> = {
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const [name, value] of Object.entries(process.env))
    if (value !== undefined && !name.startsWith("GIT_")) env[name] = value;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const tap = join(root, "tap");
  git(root, "init", "--bare", "--quiet", "--initial-branch=main", remote);
  git(root, "clone", "--quiet", remote, seed);
  mkdirSync(join(seed, "Formula"));
  writeFileSync(join(seed, "Formula", "axm.rb"), published);
  git(seed, "add", "Formula/axm.rb");
  git(seed, ...fixtureIdentity, "commit", "--quiet", "-m", "fixture");
  git(seed, "push", "--quiet", "origin", "main");
  git(root, "clone", "--quiet", remote, tap);
  const submit = (basis: string) =>
    submitHomebrewFormula({ tap, version: "1.2.3", basis, content: formula("1.2.3"), env }).pipe(
      Effect.provide(NodeServices.layer),
    );
  return { root, remote, tap, env, git, submit };
};

describe("Homebrew tap submission", () => {
  it.effect("commits the prepared formula under a command-scoped bot identity", () =>
    Effect.gen(function* () {
      const { remote, tap, git, submit } = makeTap(formula("1.2.2"));
      yield* submit(formula("1.2.2"));
      expect(git(remote, "show", "main:Formula/axm.rb")).toBe(formula("1.2.3").trim());
      expect(git(remote, "log", "-1", "--format=%an <%ae>|%cn <%ce>", "main")).toBe(
        `${botIdentity}|${botIdentity}`,
      );
      expect(git(tap, "config", "--local", "--list")).not.toContain("user.");
    }),
  );

  it.effect("refuses a tap that changed after preparation without committing", () =>
    Effect.gen(function* () {
      const { remote, tap, git, submit } = makeTap(formula("1.2.2"));
      const published = git(remote, "rev-parse", "main");
      const failure = yield* Effect.flip(submit(formula("1.2.1")));
      expect(failure.message).toBe(
        "Homebrew tap changed concurrently; rerun publication preflight.",
      );
      expect(readFileSync(join(tap, "Formula", "axm.rb"), "utf8")).toBe(formula("1.2.2"));
      expect(git(tap, "rev-parse", "HEAD")).toBe(published);
      expect(git(remote, "rev-parse", "main")).toBe(published);
    }),
  );

  it.effect("stops as superseded when a newer formula landed after preparation", () =>
    Effect.gen(function* () {
      const { remote, tap, git, submit } = makeTap(formula("1.3.0"));
      const published = git(remote, "rev-parse", "main");
      const failure = yield* Effect.flip(submit(formula("1.2.2")));
      expect(failure).toBeInstanceOf(SupersededRelease);
      expect(readFileSync(join(tap, "Formula", "axm.rb"), "utf8")).toBe(formula("1.3.0"));
      expect(git(remote, "rev-parse", "main")).toBe(published);
    }),
  );

  it.effect("fails one rejected push without retrying or replacing concurrent remote state", () =>
    Effect.gen(function* () {
      const { root, remote, tap, env, git, submit } = makeTap(formula("1.2.2"));
      const base = git(remote, "rev-parse", "main");
      const concurrent = git(
        remote,
        ...fixtureIdentity,
        "commit-tree",
        git(remote, "rev-parse", "main^{tree}"),
        "-p",
        base,
        "-m",
        "Concurrent tap change",
      );
      const attempts = join(root, "push-attempts");
      // Move the remote between the push's ref advertisement and its update.
      writeFileSync(
        join(tap, ".git", "hooks", "pre-push"),
        '#!/bin/sh\nprintf "attempt\\n" >> "$TAP_PUSH_LOG"\ngit --git-dir="$TAP_REMOTE" update-ref refs/heads/main "$TAP_CONCURRENT"\n',
        { mode: 0o755 },
      );
      Object.assign(env, {
        TAP_PUSH_LOG: attempts,
        TAP_REMOTE: remote,
        TAP_CONCURRENT: concurrent,
      });
      const failure = yield* Effect.flip(submit(formula("1.2.2")));
      expect(failure._tag).toBe("ReleaseCommandFailed");
      expect(git(remote, "rev-parse", "main")).toBe(concurrent);
      expect(readFileSync(attempts, "utf8").trim().split("\n")).toEqual(["attempt"]);
    }),
  );
});
