import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { makeCliTestContext } from "../../test-support/test-helpers.js";
import { humanScreenLayer, makeRecordingStreams } from "../../test-support/screen-harness.js";
import {
  handleArchive,
  handleDeprecate,
  handleUnarchive,
  handleUndeprecate,
  handleUnyank,
  handleYank,
} from "./command.js";

const target = "@acme/skills/review";
const archived = { archivedAt: "2026-09-19T00:00:00.000Z", reason: "No longer maintained" };
const deprecated = {
  deprecatedAt: "2026-09-19T00:00:00.000Z",
  message: "Move review workflows",
  replacement: { status: "available", fqn: "@acme/skills/reviewer" },
};

describe("Registry lifecycle human output", () => {
  for (const quiet of [false, true]) {
    for (const action of ["archive", "unarchive", "deprecate", "undeprecate"] as const) {
      it.effect(
        `${action} preserves its acknowledged state and guidance on stdout (quiet=${quiet})`,
        () => {
          const removing = action === "unarchive" || action === "undeprecate";
          const state = action === "archive" || action === "unarchive" ? archived : deprecated;
          const before = removing ? state : null;
          const transition = {
            target,
            before,
            after: removing ? null : state,
            disposition: removing ? "restored" : "created",
            revision: "revision-after-write",
          };
          const httpClient = HttpClient.make((request) =>
            Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json(
                  request.method === "GET"
                    ? {
                        [action === "archive" || action === "unarchive"
                          ? "archival"
                          : "deprecation"]: before,
                        revision: "revision-before-write",
                      }
                    : transition,
                ),
              ),
            ),
          );
          const streams = makeRecordingStreams();
          const context = makeCliTestContext({
            httpClient,
            flags: { quiet },
            screenLayer: humanScreenLayer(streams, { quiet }),
          });
          return Effect.gen(function* () {
            switch (action) {
              case "archive":
                yield* handleArchive({ ref: target, reason: Option.some(archived.reason) });
                break;
              case "unarchive":
                yield* handleUnarchive(target);
                break;
              case "deprecate":
                yield* handleDeprecate({
                  ref: target,
                  message: Option.some(deprecated.message),
                  replacement: Option.some(deprecated.replacement.fqn),
                  clearMessage: false,
                  clearReplacement: false,
                });
                break;
              case "undeprecate":
                yield* handleUndeprecate(target);
                break;
            }
            const stdout = streams.lines("stdout").join("\n");
            expect(stdout).toContain(target);
            expect(stdout).toContain("revision-after-write");
            expect(stdout).toContain(removing ? "to active" : "State: active to");
            if (action === "archive") expect(stdout).toContain(archived.reason);
            if (action === "deprecate") {
              expect(stdout).toContain(deprecated.message);
              expect(stdout).toContain(deprecated.replacement.fqn);
            }
            if (quiet) expect(streams.lines("stderr")).toEqual([]);
            else expect(streams.lines("stderr").join("\n")).toContain(target);
          }).pipe(Effect.provide(context.baseLayer));
        },
      );
    }
  }

  for (const action of ["yank", "unyank"] as const) {
    it.effect(`${action} names the exact version and remote disposition on stdout`, () => {
      const httpClient = HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            Response.json({
              owner: "@acme",
              type: "skill",
              name: "review",
              version: "1.0.0",
              yankedAt: action === "yank" ? "2026-09-19T00:00:00.000Z" : null,
              yankCategory: null,
              yankNotice: null,
              links: { html: "https://registry.example.com/@acme/skills/review" },
            }),
          ),
        ),
      );
      const streams = makeRecordingStreams();
      const context = makeCliTestContext({ httpClient, screenLayer: humanScreenLayer(streams) });
      return Effect.gen(function* () {
        const ref = `${target}@1.0.0`;
        if (action === "yank")
          yield* handleYank({
            ref,
            allVersions: false,
            category: Option.none(),
            notice: Option.none(),
          });
        else yield* handleUnyank(ref);
        const stdout = streams.lines("stdout").join("\n");
        expect(stdout).toContain(ref);
        expect(stdout).toContain(
          action === "yank" ? "Exact installs remain available" : "to fresh resolution",
        );
      }).pipe(Effect.provide(context.baseLayer));
    });
  }
});
