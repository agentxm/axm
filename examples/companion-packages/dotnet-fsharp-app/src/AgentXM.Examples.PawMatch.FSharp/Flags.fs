module AgentXM.Examples.PawMatch.FSharp.Flags

open AgentXM.Examples.TinyFlags.FSharp

[<Literal>]
let HomeCheckFollowup = "home-check-followup"

[<Literal>]
let FeeBreakdownDetailed = "fee-breakdown-detailed"

[<Literal>]
let LongStayHighlight = "long-stay-highlight"

[<Literal>]
let SuggestDonateAfterAdoption = "suggest-donate-after-adoption"

[<Literal>]
let ShowCharityRatings = "show-charity-ratings"

[<Literal>]
let RecommendationStrategy = "recommendation-strategy"

[<Literal>]
let MatchQuizDepth = "match-quiz-depth"

[<Literal>]
let PetCardStyle = "pet-card-style"

[<Literal>]
let DonateFocusDefault = "donate-focus-default"

let create () =
    TinyFlags.create [
        HomeCheckFollowup, Flag.Boolean(defaultValue = false, rollout = 25)
        FeeBreakdownDetailed, Flag.Boolean(defaultValue = true)
        LongStayHighlight, Flag.Boolean(defaultValue = true)
        SuggestDonateAfterAdoption, Flag.Boolean(defaultValue = false, rollout = 50)
        ShowCharityRatings, Flag.Boolean(defaultValue = true)
        RecommendationStrategy,
        Flag.Variant(
            variants = [ "popularity"; "match-quiz"; "longest-stay" ],
            defaultValue = "match-quiz",
            rollout = Map.ofList [ "longest-stay", 20 ]
        )
        MatchQuizDepth,
        Flag.Variant(variants = [ "short"; "standard"; "thorough" ], defaultValue = "standard")
        PetCardStyle,
        Flag.Variant(variants = [ "compact"; "detailed"; "playful" ], defaultValue = "detailed")
        DonateFocusDefault,
        Flag.Variant(variants = [ "all"; "shelters"; "rescue" ], defaultValue = "all")
    ]
