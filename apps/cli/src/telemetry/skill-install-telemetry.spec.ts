import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type {
  GitHostedSkillRef,
  RegistrySkillRef,
} from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { InstalledSkill } from "@agentxm/workspace-features/lifecycle";
import {
  telemetryIngestResponse,
  telemetryReporterLayer,
} from "../test-support/telemetry-harness.js";
import { TelemetryClient, TelemetryEventsRequest, type TelemetryClientOptions } from "./index.js";

export const specification = defineSpecification({
  requirement: "system/security/skill-install-telemetry-public-identity",
  title: "Skill install telemetry identifies only currently public sources",
  statement:
    "Skill installation telemetry shall report stable public source coordinates separately from immutable revision, with finite caller and verified target agents; Registry evidence must be current and production-owned, GitHub evidence must be an unauthenticated fixed-origin public response memoized only within the invocation, and absent consent or evidence shall omit the observation without changing installation outcomes or starting preview visibility probes.",
  class: "quality",
  characteristic: "privacy",
  role: "interface",
  goals: ["privacy-and-consent"],
  methods: ["contract", "decision-table", "example"],
  derivedFrom: ["system/security/telemetry-consent-and-precedence"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const name = decodeExtensionNameSync("review");
const shared = {
  type: "skill" as const,
  owner: decodeHandleSync("@acme"),
  name,
  skill: { name, description: Option.none<string>(), metadata: Option.none() },
};
const git = (sourcePath = "plugins/quality/skills/review"): GitHostedSkillRef => ({
  ...shared,
  refType: "git-hosted",
  source: {
    type: "git",
    url: new URL("https://token:secret@github.com/Acme/Tools.git?secret#private"),
    ref: Option.some("main"),
    subPath: Option.none(),
  },
  location: "file:///private/cache",
  sourcePath,
  gitCommitSha: "a".repeat(40),
  gitTreeSha: "b".repeat(40),
});
const registry = (): RegistrySkillRef => ({
  ...shared,
  refType: "registry",
  visibility: "public",
  publisherBindingId: "hbnd_01j00000000000000000000000",
  version: decodeVersionSync("1.0.0"),
  integrity: Option.none(),
  packages: [],
  source: {
    type: "registry",
    name: "private-alias",
    location: new URL("https://registry.agentxm.ai"),
    owner: Option.none(),
  },
});
const installed = (ref: InstalledSkill["ref"]): InstalledSkill => ({
  ref,
  scope: "project",
  installKind: "install",
  targetAgents: ["claude-code", "claude-code", "unrecognized"],
});
const run = (
  skills: ReadonlyArray<InstalledSkill>,
  options: Partial<TelemetryClientOptions> = {},
  metadata: unknown = { private: false, visibility: "public", full_name: "Acme/Tools" },
  status = 200,
) =>
  Effect.gen(function* () {
    const probes: string[] = [];
    const headers: unknown[] = [];
    const events: unknown[] = [];
    const previews: string[] = [];
    let detections = 0;
    let interruptedProbes = 0;
    const client = HttpClient.make((request) => {
      if (status === 0 && request.url.startsWith("https://api.github.com/"))
        return Effect.sync(() => {
          probes.push(request.url);
        }).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interruptedProbes++;
            }),
          ),
        );
      return Effect.sync(() => {
        if (request.url.startsWith("https://api.github.com/")) {
          probes.push(request.url);
          headers.push(request.headers);
          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify(metadata), { status }),
          );
        }
        if (request.body._tag !== "Uint8Array") throw new Error("Expected JSON body");
        const body: unknown = JSON.parse(new TextDecoder().decode(request.body.body));
        events.push(body);
        return telemetryIngestResponse(request, body);
      });
    });
    yield* TelemetryClient.use((client) => client.trackSkillInstalls(skills)).pipe(
      Effect.provide(
        telemetryReporterLayer({
          client,
          reporter: {
            mode: "all",
            client: { name: "cli", version: "1.0.0" },
            installationId: "00000000-0000-4000-8000-000000000001",
            deliverInTest: true,
            detectCaller: Effect.sync(() => {
              detections++;
              return "codex" as const;
            }),
            diagnostic: (line) =>
              Effect.sync(() => {
                previews.push(line);
              }),
            ...options,
          },
        }),
      ),
    );
    return {
      events: events.map((event) => Schema.decodeUnknownSync(TelemetryEventsRequest)(event)),
      probes,
      headers,
      previews,
      detections,
      interruptedProbes,
    };
  });

describe("Public skill install telemetry", () => {
  it.effect(
    "strips transport data, retains actual plugin-relative roots, and shares one public probe",
    () =>
      Effect.gen(function* () {
        const result = yield* run([installed(git()), installed(git("."))]);
        expect(result.probes).toEqual(["https://api.github.com/repos/acme/tools"]);
        expect(JSON.stringify(result.headers)).not.toContain("authorization");
        expect(result.detections).toBe(1);
        expect(result.events).toHaveLength(2);
        const events = result.events.flatMap((batch) => batch.events);
        expect(events[0]?.properties).toEqual({
          skill: {
            kind: "git",
            repositoryUrl: "https://github.com/Acme/Tools",
            skillPath: "plugins/quality/skills/review",
          },
          revision: { kind: "git", commitSha: "a".repeat(40) },
          scope: "project",
          installKind: "install",
          targetAgents: ["claude-code"],
        });
        expect(events[0]?.eventId).not.toBe(events[1]?.eventId);
        expect(result.events[0]?.context?.callerAgent).toBe("codex");
        expect(JSON.stringify(result.events)).not.toMatch(
          /secret|private-alias|file:\/\/|gitTreeSha/,
        );
        expect(events.every((event) => event.anonymous === true)).toBe(true);
      }),
  );
  it.effect.each([
    { private: true, visibility: "private", full_name: "Acme/Tools" },
    { private: false, visibility: "internal", full_name: "Acme/Tools" },
    { private: false, visibility: "public", full_name: "Other/Tools" },
    {},
  ])("omits unverifiable repository metadata %#", (metadata) =>
    Effect.gen(function* () {
      expect((yield* run([installed(git())], {}, metadata)).events).toEqual([]);
    }),
  );
  it.effect.each([401, 403, 404, 429, 500, 302])("omits HTTP %s", (status) =>
    Effect.gen(function* () {
      expect((yield* run([installed(git())], {}, {}, status)).events).toEqual([]);
    }),
  );
  it.effect.each([
    "",
    "/home/private",
    "C:/Users/private",
    "../review",
    "skills/../review",
    "skills\\review",
    "skills/SKILL.md",
  ])("omits invalid directory %s before probing", (directory) =>
    Effect.gen(function* () {
      const result = yield* run([installed(git(directory))]);
      expect(result.events).toEqual([]);
      expect(result.probes).toEqual([]);
    }),
  );
  it.effect(
    "requires current production Registry evidence and separates mutable owner from binding",
    () =>
      Effect.gen(function* () {
        const ref = registry();
        const { visibility: _visibility, ...unknown } = ref;
        const result = yield* run([
          installed(ref),
          installed({ ...ref, visibility: "private" }),
          installed(unknown),
          installed({
            ...ref,
            source: { ...ref.source, location: new URL("https://registry.example") },
          }),
        ]);
        expect(result.probes).toEqual([]);
        expect(result.events).toHaveLength(1);
        expect(result.events[0]?.events[0]?.properties).toEqual({
          skill: {
            kind: "registry",
            registryUrl: "https://registry.agentxm.ai",
            publisherBindingId: ref.publisherBindingId,
            extensionType: "skill",
            packageName: "review",
          },
          revision: { kind: "registry", version: "1.0.0" },
          scope: "project",
          installKind: "install",
          targetAgents: ["claude-code"],
        });
      }),
  );
  it.effect("preview prints eligible Registry payloads and starts no GitHub probes", () =>
    Effect.gen(function* () {
      const result = yield* run([installed(git()), installed(registry())], { preview: true });
      expect(result.probes).toEqual([]);
      expect(result.events).toEqual([]);
      expect(result.previews).toHaveLength(1);
      expect(result.previews[0]).toContain("skill_install_completed");
    }),
  );
  it.effect.each(["off", "errors"] as const)(
    "%s mode does not prepare skill payloads or probes",
    (mode) =>
      Effect.gen(function* () {
        const result = yield* run([installed(git()), installed(registry())], {
          mode,
          preview: true,
        });
        expect(result.events).toEqual([]);
        expect(result.probes).toEqual([]);
        expect(result.previews).toEqual([]);
        expect(result.detections).toBe(mode === "off" ? 0 : 1);
      }),
  );
  it.effect("interrupts a stalled caller within the reporter's one shutdown budget", () =>
    Effect.gen(function* () {
      let interrupted = false;
      const fiber = yield* run([installed(git())], {
        detectCaller: Effect.never.pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              interrupted = true;
            }),
          ),
        ),
      }).pipe(Effect.forkChild);
      yield* TestClock.adjust("250 millis");
      const result = yield* Fiber.join(fiber);
      expect(interrupted).toBe(true);
      expect(result.probes).toEqual([]);
      expect(result.events).toEqual([]);
    }),
  );

  it.effect("interrupts a stalled public probe within the shared shutdown budget", () =>
    Effect.gen(function* () {
      const fiber = yield* run([installed(git())], {}, {}, 0).pipe(Effect.forkChild);
      yield* TestClock.adjust("250 millis");
      const result = yield* Fiber.join(fiber);
      expect(result.probes).toHaveLength(1);
      expect(result.interruptedProbes).toBe(1);
      expect(result.events).toEqual([]);
    }),
  );
  it.effect("deduplicates stable identity across overlap and unions successful target agents", () =>
    Effect.gen(function* () {
      const ref = registry();
      const result = yield* run([
        installed(ref),
        { ...installed({ ...ref, owner: decodeHandleSync("@renamed") }), targetAgents: ["codex"] },
      ]);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.events[0]?.properties).toMatchObject({
        targetAgents: ["claude-code", "codex"],
      });
    }),
  );
  it.effect("normalizes HTTPS and SSH acquisition transports to one public Git identity", () =>
    Effect.gen(function* () {
      const ref = git();
      const result = yield* run([
        installed(ref),
        installed({
          ...ref,
          source: { ...ref.source, url: new URL("ssh://git@github.com/Acme/Tools.git") },
        }),
      ]);
      expect(result.probes).toEqual(["https://api.github.com/repos/acme/tools"]);
      expect(result.events).toHaveLength(1);
    }),
  );
});
