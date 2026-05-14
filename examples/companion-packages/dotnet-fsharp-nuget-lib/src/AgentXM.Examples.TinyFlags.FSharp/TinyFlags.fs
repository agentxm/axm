namespace AgentXM.Examples.TinyFlags.FSharp

open System
open System.Collections.Generic

/// Identity attributes used to bucket a flag evaluation deterministically.
type EvaluationContext =
    { UserId: string option
      AccountId: string option
      SessionId: string option }

module EvaluationContext =
    /// An evaluation context with no identity attributes.
    let empty =
        { UserId = None
          AccountId = None
          SessionId = None }

/// A validated flag definition produced by `FlagDefinition.booleanFlag` or `variantFlag`.
type FlagDefinition =
    | BooleanFlag of defaultValue: bool * rollout: int option
    | VariantFlag of variants: string list * defaultValue: string * rollout: Map<string, int> option

/// The typed result of evaluating a flag.
type FlagValue =
    | BoolValue of bool
    | VariantValue of string

/// Smart constructors for `FlagDefinition` that validate inputs and accept
/// optional named parameters. Static-only — never instantiated.
[<AbstractClass; Sealed>]
type Flag private () =

    static member private ValidatePercentage(label, percentage) =
        if percentage < 0 || percentage > 100 then
            invalidArg label $"Percentage must be from 0 to 100; received {percentage}."

        percentage

    static member private NormalizeRollout(variants: string list, allocation: Map<string, int>) =
        let known = Set.ofList variants

        let normalized, total =
            allocation
            |> Map.fold
                (fun (acc, runningTotal) variant percentage ->
                    if not (Set.contains variant known) then
                        invalidArg "rollout" $"Rollout references unknown variant: {variant}."

                    let validated = Flag.ValidatePercentage($"rollout for '{variant}'", percentage)
                    Map.add variant validated acc, runningTotal + validated)
                (Map.empty, 0)

        if total > 100 then
            invalidArg "rollout" $"Variant rollout percentages cannot exceed 100; received {total}."

        normalized

    /// Define a boolean feature flag. `rollout` is an optional 0–100 enabled percentage.
    static member Boolean(defaultValue: bool, ?rollout: int) : FlagDefinition =
        BooleanFlag(defaultValue, rollout |> Option.map (fun pct -> Flag.ValidatePercentage("rollout", pct)))

    /// Define a multi-variant feature flag. `defaultValue` defaults to the first variant.
    static member Variant
        (variants: string list, ?defaultValue: string, ?rollout: Map<string, int>)
        : FlagDefinition =
        match variants with
        | [] -> invalidArg "variants" "Variant flags require at least one variant."
        | _ ->
            let unique = List.distinct variants

            if unique.Length <> variants.Length || List.exists String.IsNullOrEmpty unique then
                invalidArg "variants" "Variant names must be unique non-empty strings."

            let chosenDefault = defaultArg defaultValue variants.Head

            if not (List.contains chosenDefault unique) then
                invalidArg "defaultValue" $"Variant default '{chosenDefault}' is not one of the variants."

            VariantFlag(unique, chosenDefault, rollout |> Option.map (fun r -> Flag.NormalizeRollout(unique, r)))

/// A bundle of named flag definitions. Construct with `TinyFlags.create`.
type TinyFlags = private { Definitions: Map<string, FlagDefinition> }

module TinyFlags =

    let private fnv1a (value: string) =
        let mutable hash = 2166136261u

        for character in value do
            hash <- hash ^^^ uint32 character
            hash <- hash * 16777619u

        hash

    let private bucketFor (name: string) (context: EvaluationContext) =
        let key =
            context.UserId
            |> Option.orElse context.AccountId
            |> Option.orElse context.SessionId
            |> Option.defaultValue "anonymous"

        int (fnv1a $"{name}:{key}" % 100u)

    let private require name flags =
        match Map.tryFind name flags.Definitions with
        | Some definition -> definition
        | None -> raise (KeyNotFoundException $"Unknown TinyFlags flag: {name}.")

    /// Build a TinyFlags bundle from a sequence of (name, definition) pairs.
    let create (definitions: seq<string * FlagDefinition>) =
        { Definitions = Map.ofSeq definitions }

    /// Evaluate a boolean flag. Throws if the flag is not boolean.
    let enabled (name: string) (context: EvaluationContext) flags =
        match require name flags with
        | BooleanFlag(defaultValue, None) -> defaultValue
        | BooleanFlag(_, Some rollout) -> bucketFor name context < rollout
        | VariantFlag _ -> invalidOp $"TinyFlags flag '{name}' is not a boolean flag."

    /// Evaluate a variant flag. Throws if the flag is not a variant flag.
    let variant (name: string) (context: EvaluationContext) flags =
        match require name flags with
        | VariantFlag(_, defaultValue, None) -> defaultValue
        | VariantFlag(_, defaultValue, Some rollout) ->
            let bucket = bucketFor name context

            let chosen, _ =
                rollout
                |> Map.toSeq
                |> Seq.fold
                    (fun (selected, upperBound) (candidate, percentage) ->
                        match selected with
                        | Some _ -> selected, upperBound
                        | None ->
                            let nextBound = upperBound + percentage

                            if bucket < nextBound then
                                Some candidate, nextBound
                            else
                                None, nextBound)
                    (None, 0)

            chosen |> Option.defaultValue defaultValue
        | BooleanFlag _ -> invalidOp $"TinyFlags flag '{name}' is not a variant flag."

    /// Evaluate any flag, returning a typed `FlagValue`.
    let evaluate (name: string) (context: EvaluationContext) flags =
        match require name flags with
        | BooleanFlag _ -> BoolValue(enabled name context flags)
        | VariantFlag _ -> VariantValue(variant name context flags)
