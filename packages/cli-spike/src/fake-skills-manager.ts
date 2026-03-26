import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/ServiceMap";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

export const FakeSkillInfoSchema = Schema.Struct({
  _version: Schema.Literal(1),
  name: Schema.String,
  source: Schema.String,
  version: Schema.NullOr(Schema.String),
  enabled: Schema.Boolean,
  scope: Schema.Literals(["project", "user"] as const),
});
export type FakeSkillInfo = typeof FakeSkillInfoSchema.Type;

const FAKE_SKILLS: ReadonlyArray<FakeSkillInfo> = [
  {
    _version: 1,
    name: "pr-review",
    source: "acme/tools",
    version: "1.2.0",
    enabled: true,
    scope: "project",
  },
  {
    _version: 1,
    name: "test-gen",
    source: "acme/tools",
    version: "1.0.3",
    enabled: true,
    scope: "project",
  },
  { _version: 1, name: "my-custom", source: "local", version: null, enabled: false, scope: "user" },
] as const;

export interface FakeSkillsManagerService {
  readonly listSkills: (scope: "project" | "user") => Effect.Effect<ReadonlyArray<FakeSkillInfo>>;
}

export class FakeSkillsManager extends ServiceMap.Service<
  FakeSkillsManager,
  FakeSkillsManagerService
>()("@axm.sh/cli-spike/FakeSkillsManager") {}

export const FakeSkillsManagerLive = Layer.effect(
  FakeSkillsManager,
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;

    return {
      listSkills: (scope) =>
        renderer.withSpinner(
          `FakeSkillsManager: preparing ${scope} demo skills`,
          (spinner) =>
            Effect.gen(function* () {
              yield* spinner.update(`Filtering ${scope} demo skills`);
              yield* renderer.info(`FakeSkillsManager: listing ${scope} demo skills`);

              return FAKE_SKILLS.filter((skill) => skill.scope === scope);
            }),
          { successMessage: "Fake skills ready" },
        ),
    } satisfies FakeSkillsManagerService;
  }),
);
