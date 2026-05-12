module AgentXM.Example.TinyFlags.FSharp.Tests.TinyFlagsTests

open System
open Xunit
open AgentXM.Example.TinyFlags.FSharp

let private context =
    { EvaluationContext.empty with UserId = Some "user-1" }

[<Fact>]
let ``boolean flags use defaults when no rollout is configured`` () =
    let flags =
        TinyFlags.create [
            "checkoutRedesign", Flag.Boolean(defaultValue = true)
        ]

    Assert.True(flags |> TinyFlags.enabled "checkoutRedesign" context)

[<Fact>]
let ``boolean rollout boundaries are deterministic`` () =
    let flags =
        TinyFlags.create [
            "disabledExperiment", Flag.Boolean(defaultValue = false, rollout = 0)
            "enabledExperiment", Flag.Boolean(defaultValue = false, rollout = 100)
        ]

    Assert.False(flags |> TinyFlags.enabled "disabledExperiment" context)
    Assert.True(flags |> TinyFlags.enabled "enabledExperiment" context)
    Assert.Equal(
        flags |> TinyFlags.enabled "enabledExperiment" context,
        flags |> TinyFlags.enabled "enabledExperiment" context
    )

[<Fact>]
let ``variant flags return the default outside rollout allocations`` () =
    let flags =
        TinyFlags.create [
            "searchRanking",
            Flag.Variant(
                variants = [ "classic"; "semantic" ],
                defaultValue = "classic",
                rollout = Map.ofList [ "semantic", 0 ]
            )
        ]

    Assert.Equal("classic", flags |> TinyFlags.variant "searchRanking" context)

[<Fact>]
let ``variant flags can allocate all traffic to a variant`` () =
    let flags =
        TinyFlags.create [
            "searchRanking",
            Flag.Variant(
                variants = [ "classic"; "semantic" ],
                defaultValue = "classic",
                rollout = Map.ofList [ "semantic", 100 ]
            )
        ]

    Assert.Equal("semantic", flags |> TinyFlags.variant "searchRanking" context)

[<Fact>]
let ``evaluate returns a typed FlagValue for each kind`` () =
    let flags =
        TinyFlags.create [
            "checkoutRedesign", Flag.Boolean(defaultValue = true)
            "searchRanking",
            Flag.Variant(
                variants = [ "classic"; "semantic" ],
                rollout = Map.ofList [ "semantic", 100 ]
            )
        ]

    Assert.Equal(BoolValue true, flags |> TinyFlags.evaluate "checkoutRedesign" context)
    Assert.Equal(VariantValue "semantic", flags |> TinyFlags.evaluate "searchRanking" context)

[<Fact>]
let ``boolean rollout above 100 fails at construction time`` () =
    Assert.Throws<ArgumentException>(fun () ->
        Flag.Boolean(defaultValue = false, rollout = 101) |> ignore)

[<Fact>]
let ``variant default must be one of the variants`` () =
    Assert.Throws<ArgumentException>(fun () ->
        Flag.Variant(variants = [ "classic"; "semantic" ], defaultValue = "personalized")
        |> ignore)

[<Fact>]
let ``variant rollout totals above 100 fail at construction time`` () =
    Assert.Throws<ArgumentException>(fun () ->
        Flag.Variant(
            variants = [ "classic"; "semantic" ],
            defaultValue = "classic",
            rollout = Map.ofList [ "semantic", 80; "classic", 30 ]
        )
        |> ignore)
