module AgentXM.Example.TinyFlags.FSharp.Tests.TinyFlagsTests

open System
open Expecto
open AgentXM.Example.TinyFlags.FSharp

let private context =
    { EvaluationContext.empty with UserId = Some "user-1" }

[<Tests>]
let tests =
    testList "TinyFlags" [
        testCase "boolean flags use defaults when no rollout is configured" <| fun _ ->
            let flags =
                TinyFlags.create [
                    "checkoutRedesign", Flag.Boolean(defaultValue = true)
                ]

            Expect.isTrue
                (flags |> TinyFlags.enabled "checkoutRedesign" context)
                "default value should be returned"

        testCase "boolean rollout boundaries are deterministic" <| fun _ ->
            let flags =
                TinyFlags.create [
                    "disabledExperiment", Flag.Boolean(defaultValue = false, rollout = 0)
                    "enabledExperiment", Flag.Boolean(defaultValue = false, rollout = 100)
                ]

            Expect.isFalse
                (flags |> TinyFlags.enabled "disabledExperiment" context)
                "0% rollout should be disabled"
            Expect.isTrue
                (flags |> TinyFlags.enabled "enabledExperiment" context)
                "100% rollout should be enabled"
            Expect.equal
                (flags |> TinyFlags.enabled "enabledExperiment" context)
                (flags |> TinyFlags.enabled "enabledExperiment" context)
                "repeated evaluations should be deterministic"

        testCase "variant flags return the default outside rollout allocations" <| fun _ ->
            let flags =
                TinyFlags.create [
                    "searchRanking",
                    Flag.Variant(
                        variants = [ "classic"; "semantic" ],
                        defaultValue = "classic",
                        rollout = Map.ofList [ "semantic", 0 ]
                    )
                ]

            Expect.equal
                (flags |> TinyFlags.variant "searchRanking" context)
                "classic"
                "no allocation should fall back to default"

        testCase "variant flags can allocate all traffic to a variant" <| fun _ ->
            let flags =
                TinyFlags.create [
                    "searchRanking",
                    Flag.Variant(
                        variants = [ "classic"; "semantic" ],
                        defaultValue = "classic",
                        rollout = Map.ofList [ "semantic", 100 ]
                    )
                ]

            Expect.equal
                (flags |> TinyFlags.variant "searchRanking" context)
                "semantic"
                "100% allocation should win"

        testCase "evaluate returns a typed FlagValue for each kind" <| fun _ ->
            let flags =
                TinyFlags.create [
                    "checkoutRedesign", Flag.Boolean(defaultValue = true)
                    "searchRanking",
                    Flag.Variant(
                        variants = [ "classic"; "semantic" ],
                        rollout = Map.ofList [ "semantic", 100 ]
                    )
                ]

            Expect.equal
                (flags |> TinyFlags.evaluate "checkoutRedesign" context)
                (BoolValue true)
                "boolean flag should evaluate to BoolValue"
            Expect.equal
                (flags |> TinyFlags.evaluate "searchRanking" context)
                (VariantValue "semantic")
                "variant flag should evaluate to VariantValue"

        testCase "boolean rollout above 100 fails at construction time" <| fun _ ->
            Expect.throwsT<ArgumentException>
                (fun () -> Flag.Boolean(defaultValue = false, rollout = 101) |> ignore)
                "rollout above 100 should throw"

        testCase "variant default must be one of the variants" <| fun _ ->
            Expect.throwsT<ArgumentException>
                (fun () ->
                    Flag.Variant(variants = [ "classic"; "semantic" ], defaultValue = "personalized")
                    |> ignore)
                "default outside variants should throw"

        testCase "variant rollout totals above 100 fail at construction time" <| fun _ ->
            Expect.throwsT<ArgumentException>
                (fun () ->
                    Flag.Variant(
                        variants = [ "classic"; "semantic" ],
                        defaultValue = "classic",
                        rollout = Map.ofList [ "semantic", 80; "classic", 30 ]
                    )
                    |> ignore)
                "rollout totals above 100 should throw"
    ]
