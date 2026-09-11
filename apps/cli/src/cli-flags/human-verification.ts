import * as Context from "effect/Context";
import type * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

export interface HumanVerificationOptionsService {
  readonly stepUpRequest: Option.Option<string>;
  readonly waitForHuman: Option.Option<number>;
}

export class HumanVerificationOptions extends Context.Service<
  HumanVerificationOptions,
  HumanVerificationOptionsService
>()("axm.sh/cli-flags/HumanVerificationOptions") {}

export const waitForHumanOption = Flag.Int("wait-for-human").pipe(
  Flag.withDescription("Wait at most this many seconds for human verification of this write"),
  Flag.optional,
);

export const humanVerificationFlags = {
  stepUpRequest: Flag.String("step-up-request").pipe(
    Flag.withDescription("Resume this write using its step-up request URL and unchanged inputs"),
    Flag.optional,
  ),
  waitForHuman: waitForHumanOption,
};

export const withHumanVerificationOptions = <
  const Name extends string,
  Input extends HumanVerificationOptionsService,
  ContextInput,
  E,
  R,
>(
  self: Command.Command<Name, Input, ContextInput, E, R>,
) =>
  Command.provideSync(HumanVerificationOptions, (input: Input) => ({
    stepUpRequest: input.stepUpRequest,
    waitForHuman: input.waitForHuman,
  }))(self);
