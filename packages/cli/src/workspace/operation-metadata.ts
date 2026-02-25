export type LockfilePolicy =
  | "materialize_if_missing"
  | "read_recover_if_missing"
  | "ignore_if_missing";

export interface OperationMetadata<TName extends string = string> {
  readonly name: TName;
  readonly lockfilePolicy: LockfilePolicy;
}

export const lockfilePolicyPrecedence: Readonly<Record<LockfilePolicy, number>> = {
  ignore_if_missing: 0,
  read_recover_if_missing: 1,
  materialize_if_missing: 2,
};

export const defineOperationMetadata = <TName extends string>(
  metadata: OperationMetadata<TName>,
): OperationMetadata<TName> => metadata;
