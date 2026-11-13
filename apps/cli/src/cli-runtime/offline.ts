import { NetworkDisabled } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { RegistryRequestFailed } from "@agentxm/registry-client";
import { booleanOptionFromArgv } from "../cli-flags/argv-boolean.js";

export const offlineFromArgv = (args: ReadonlyArray<string>): boolean =>
  Option.getOrElse(booleanOptionFromArgv(args, ["--offline"]), () => false);

export const offlineHttpClient = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.flatMap(NetworkDisabled, (offline) =>
      offline
        ? Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause: new RegistryRequestFailed({
                  reason: "network-required",
                  category: "network",
                  detail:
                    "network-required: This operation requires network access, which --offline prohibits.",
                }),
                description: "Network access is disabled by --offline.",
              }),
            }),
          )
        : client.execute(request),
    ),
  );

/** No current subprocess adapter provides enforceable network isolation. */
export const offlineProcessSpawner = (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
) =>
  ChildProcessSpawner.make((command) =>
    Effect.flatMap(NetworkDisabled, (offline) =>
      offline
        ? Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "ChildProcess",
              method: "spawn",
              description:
                "network-required: --offline refuses subprocess execution without enforced network isolation.",
            }),
          )
        : spawner.spawn(command),
    ),
  );
