import * as Config from "effect/Config";
import type * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { NpmPackagesUninitialized } from "./release-publication.js";

export type NpmPublicationAuth =
  | { readonly kind: "oidc" }
  | {
      readonly kind: "initialize";
      readonly token: Redacted.Redacted<string>;
      readonly userConfig: string;
    };

/** Load once at the script boundary; configuration failures remain typed. */
export const loadNpmPublicationAuth = (provider: ConfigProvider.ConfigProvider) =>
  Effect.gen(function* () {
    const token = yield* Config.Redacted("NPM_INITIAL_PUBLISH_TOKEN")
      .pipe(Config.option)
      .parse(provider);
    if (Option.isNone(token)) return { kind: "oidc" } as const;
    const userConfig = yield* Config.String("NPM_CONFIG_USERCONFIG").parse(provider);
    return { kind: "initialize", token: token.value, userConfig } as const;
  });

/** Select credentials at the foreign npm process boundary, after package existence is known. */
export const npmPublicationProcessEnvironment = (
  name: string,
  packageExists: boolean,
  authentication: NpmPublicationAuth,
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv => {
  if (!packageExists && authentication.kind !== "initialize") {
    throw new NpmPackagesUninitialized({ packages: [name] });
  }
  const result = { ...environment };
  delete result["NPM_INITIAL_PUBLISH_TOKEN"];
  delete result["NODE_AUTH_TOKEN"];
  delete result["NPM_CONFIG_USERCONFIG"];
  if (!packageExists && authentication.kind === "initialize") {
    result["NODE_AUTH_TOKEN"] = Redacted.value(authentication.token);
    result["NPM_CONFIG_USERCONFIG"] = authentication.userConfig;
  }
  return result;
};
