import { expect, it } from "vitest";
import { specificationTarget } from "./specification-targets.js";

it.each([
  {
    targets: ["test", "test:performance"],
    characteristic: "performance",
    expected: "test:performance",
  },
  {
    targets: ["e2e-main", "test:performance"],
    characteristic: "performance",
    expected: "test:performance",
  },
  { targets: ["test", "test:performance"], characteristic: undefined, expected: "test" },
  { targets: ["e2e-main", "test:performance"], characteristic: undefined, expected: "e2e-main" },
  { targets: ["test"], characteristic: "performance", expected: "test" },
])(
  "selects $expected for $characteristic from $targets",
  ({ targets, characteristic, expected }) => {
    expect(specificationTarget(targets, characteristic)).toBe(expected);
  },
);
