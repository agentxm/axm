import * as Array from "effect/Array";
import * as Option from "effect/Option";

export const filterMapOccurrences = <TOccurrence extends { readonly type: string }, A>(
  occurrences: ReadonlyArray<TOccurrence>,
  type: TOccurrence["type"],
  map: (occurrence: TOccurrence) => A,
): ReadonlyArray<A> =>
  Array.getSomes(
    occurrences.map((occurrence) =>
      occurrence.type === type ? Option.some(map(occurrence)) : Option.none(),
    ),
  );
