import { GlobalFlag } from "effect/unstable/cli";

export const removeBuiltInFlag = (flag: (typeof GlobalFlag.BuiltIns)[number]): void => {
  const index = GlobalFlag.BuiltIns.indexOf(flag);
  if (index >= 0) {
    Array.prototype.splice.call(GlobalFlag.BuiltIns, index, 1);
  }
};
