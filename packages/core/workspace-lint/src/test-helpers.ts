/**
 * Running a real lint over a throwaway workspace from this package's own
 * tests and specifications.
 *
 * The fixture in `./testing.js` supplies the workspace and every service a
 * lint run reads it through except the two the package deliberately leaves to
 * its caller: the platform, and the statement of which extension types
 * contribute projections. This helper states both — the host file system, so
 * a run observes the same bytes the product observes; a transport that
 * refuses every request, so a run that reached the network would fail loudly;
 * and no projection participants, so nothing outside `@agentxm/workspace-lint`
 * decides what a fixture's workspace is expected to contain.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientError from "effect/unstable/http/HttpClientError";

import { NoProjectionParticipants } from "@agentxm/workspace-projection/testing";

import type { LintWorkspaceFixture } from "./testing.js";
import { fixLintWorkspace, queryLintWorkspace } from "./run/lint-workspace.js";
import type { LintJsonFinding } from "./json-schema.js";

/** A lint run reads no Registry, so a transport that refuses proves it. */
export const OfflineHttpClient: Layer.Layer<HttpClient.HttpClient> = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          request,
          cause: new Error("A lint run must not reach the network."),
          description: "Offline test transport",
        }),
      }),
    ),
  ),
);

/** Every service a lint run over `fixture` reads the workspace through. */
export const lintServices = (fixture: LintWorkspaceFixture) =>
  fixture.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(NodeServices.layer, OfflineHttpClient, NoProjectionParticipants),
    ),
  );

/** The workspace-view selection every project-scope example lints through. */
export const projectSelection = (fixture: LintWorkspaceFixture, fix = false) => ({
  workspaceRoot: fixture.root,
  userHome: fixture.root,
  scope: "project" as const,
  input: { view: "workspace" as const },
  fix,
});

/** Report the workspace's facts, without changing it. */
export const lintProject = (
  fixture: LintWorkspaceFixture,
  options: { readonly strict?: boolean } = {},
) => queryLintWorkspace(projectSelection(fixture), { strict: options.strict ?? false });

/** Report the facts of a project whose user scope lives at a separate `userHome`. */
export const lintProjectWithHome = (
  fixture: LintWorkspaceFixture,
  userHome: string,
  options: { readonly strict?: boolean } = {},
) =>
  queryLintWorkspace(
    { ...projectSelection(fixture), userHome },
    { strict: options.strict ?? false },
  );

/** Repair the determined state, then report what remains. */
export const fixProject = (
  fixture: LintWorkspaceFixture,
  options: { readonly strict?: boolean } = {},
) => fixLintWorkspace(projectSelection(fixture, true), { strict: options.strict ?? false });

/** A finding reduced to the pair a decision table names it by. */
export const ruleSeverityRows = (
  findings: ReadonlyArray<LintJsonFinding>,
): ReadonlyArray<readonly [string, string]> =>
  findings.map(({ ruleId, severity }) => [ruleId, severity] as const);
