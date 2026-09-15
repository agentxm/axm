import * as semver from "semver";

export type PackDependencyAuthority = "workspace" | "registry";
export type PackDependencyReachabilityClassification = "satisfying" | "excluded" | "missing";

export interface PackDependencyMemberObservation {
  readonly fqn: string;
  readonly version: string;
  readonly authority: PackDependencyAuthority;
}

export interface PackDependencyDeclaration {
  readonly packFqn: string;
  readonly packAuthority: PackDependencyAuthority;
  readonly manifestPath: string;
  readonly dependencies: Readonly<Record<string, string>>;
}

export interface PackDependencyReachability {
  readonly packFqn: string;
  readonly packAuthority: PackDependencyAuthority;
  readonly manifestPath: string;
  readonly memberFqn: string;
  readonly constraint: string;
  readonly memberVersion?: string;
  readonly memberAuthority?: PackDependencyAuthority;
  readonly classification: PackDependencyReachabilityClassification;
}

export const classifyPackDependencyReachability = (args: {
  readonly constraint: string;
  readonly member?: PackDependencyMemberObservation;
}): PackDependencyReachabilityClassification => {
  if (args.member === undefined) return "missing";
  return semver.satisfies(args.member.version, args.constraint) ? "satisfying" : "excluded";
};

/**
 * Build the deterministic, network-free pack/member reachability projection.
 * Invalid ranges are omitted because manifest validation owns that failure.
 */
export const buildPackDependencyReachability = (args: {
  readonly packs: ReadonlyArray<PackDependencyDeclaration>;
  readonly members: ReadonlyArray<PackDependencyMemberObservation>;
}): ReadonlyArray<PackDependencyReachability> => {
  const members = new Map(args.members.map((member) => [member.fqn, member]));
  return [...args.packs]
    .sort((left, right) => left.packFqn.localeCompare(right.packFqn))
    .flatMap((pack) =>
      Object.entries(pack.dependencies)
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([memberFqn, constraint]) => {
          if (semver.validRange(constraint) === null) return [];
          const member = members.get(memberFqn);
          return [
            {
              packFqn: pack.packFqn,
              packAuthority: pack.packAuthority,
              manifestPath: pack.manifestPath,
              memberFqn,
              constraint,
              ...(member === undefined
                ? {}
                : { memberVersion: member.version, memberAuthority: member.authority }),
              classification: classifyPackDependencyReachability({
                constraint,
                ...(member === undefined ? {} : { member }),
              }),
            },
          ];
        }),
    );
};

export const packDependencyReachabilityByMember = (
  records: ReadonlyArray<PackDependencyReachability>,
): ReadonlyMap<string, ReadonlyArray<PackDependencyReachability>> => {
  const mutable = new Map<string, Array<PackDependencyReachability>>();
  for (const record of records) {
    const existing = mutable.get(record.memberFqn);
    if (existing === undefined) mutable.set(record.memberFqn, [record]);
    else existing.push(record);
  }
  return new Map(
    [...mutable.entries()].map(([member, values]) => [
      member,
      [...values].sort((left, right) => left.packFqn.localeCompare(right.packFqn)),
    ]),
  );
};
