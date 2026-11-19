import { galleryModule } from "../../test-support/gallery/fixture.js";
import { cachePruneDoc, cacheStatusDoc, cacheVerifyDoc } from "./view.js";

/**
 * Archive cache maintenance as records: what the cache holds and its limits,
 * then what verification and pruning settled, each a verdict with its facts.
 */
export default galleryModule(
  {
    _tag: "document",
    name: "record--cache-status",
    doc: cacheStatusDoc({
      entries: 42,
      bytes: 18_400_000,
      maxBytes: 500_000_000,
      maxAgeDays: 30,
    }),
  },
  {
    _tag: "document",
    name: "record--cache-maintenance",
    doc: [
      { _tag: "section", children: cacheVerifyDoc({ checked: 42, corruptRemoved: 1 }) },
      {
        _tag: "section",
        children: cachePruneDoc({
          removed: 7,
          bytesFreed: 3_200_000,
          remaining: 34,
          remainingBytes: 15_200_000,
        }),
      },
    ],
  },
);
