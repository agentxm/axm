module AgentXM.Examples.PawMatch.FSharp.PawMatchCli

open System
open System.Diagnostics
open System.IO
open Argu
open AgentXM.Examples.TinyFlags.FSharp
open AgentXM.Examples.PawMatch.FSharp
open AgentXM.Examples.PawMatch.FSharp.Variants

let private allFactors: (string * string list) list =
    [ "has-kids", [ "good-with-kids"; "gentle" ]
      "quiet-home", [ "mellow"; "calm"; "solo"; "lap-cat" ]
      "active", [ "high-energy"; "playful" ]
      "first-time", [ "gentle"; "calm"; "low-energy" ]
      "multiple-pets", [ "social" ]
      "small-home", [ "lap-cat"; "solo"; "low-energy" ] ]

let private popularityTags =
    Set.ofList [ "social"; "good-with-kids"; "calm"; "mellow"; "gentle" ]

type BrowseArgs =
    | [<Unique>] Species of string

    interface IArgParserTemplate with
        member this.Usage =
            match this with
            | Species _ -> "Filter by species (dog|cat|rabbit|guinea-pig)."

type ShowArgs =
    | [<MainCommand; ExactlyOnce; Last>] Pet of pet: string

    interface IArgParserTemplate with
        member this.Usage =
            match this with
            | Pet _ -> "Pet slug (see 'pawmatch browse')."

type MatchArgs =
    | [<Unique>] Has_Kids
    | [<Unique>] Quiet_Home
    | [<Unique>] Active
    | [<Unique>] First_Time
    | [<Unique>] Multiple_Pets
    | [<Unique>] Small_Home

    interface IArgParserTemplate with
        member this.Usage =
            match this with
            | Has_Kids -> "Family with children."
            | Quiet_Home -> "Quiet, calm household."
            | Active -> "Active, outdoor lifestyle."
            | First_Time -> "First-time pet adopter."
            | Multiple_Pets -> "Other pets at home."
            | Small_Home -> "Small home or apartment."

type ApplyArgs =
    | [<MainCommand; ExactlyOnce; Last>] Pet of pet: string

    interface IArgParserTemplate with
        member this.Usage =
            match this with
            | Pet _ -> "Pet slug to apply for."

type DonateArgs =
    | [<MainCommand; Last>] Charity of charity: string
    | [<Unique>] Focus of string
    | [<Unique; CustomCommandLine("--open")>] Open_Browser

    interface IArgParserTemplate with
        member this.Usage =
            match this with
            | Charity _ -> "Charity slug (optional — omit to list charities)."
            | Focus _ -> "Charity focus (all|shelters|rescue|policy)."
            | Open_Browser -> "Open the charity's donation URL in a browser."

type PawMatchCommand =
    | [<CliPrefix(CliPrefix.None)>] Browse of ParseResults<BrowseArgs>
    | [<CliPrefix(CliPrefix.None)>] Show of ParseResults<ShowArgs>
    | [<CliPrefix(CliPrefix.None)>] Match of ParseResults<MatchArgs>
    | [<CliPrefix(CliPrefix.None)>] Apply of ParseResults<ApplyArgs>
    | [<CliPrefix(CliPrefix.None)>] Fees
    | [<CliPrefix(CliPrefix.None); CustomCommandLine("return-support")>] ReturnSupport
    | [<CliPrefix(CliPrefix.None)>] Donate of ParseResults<DonateArgs>

    interface IArgParserTemplate with
        member this.Usage =
            match this with
            | Browse _ -> "Browse adoptable pets."
            | Show _ -> "Show details for a pet."
            | Match _ -> "Match pets to your lifestyle."
            | Apply _ -> "Start an adoption application."
            | Fees -> "Show adoption fees."
            | ReturnSupport -> "Return support information."
            | Donate _ -> "Browse animal-welfare charities to support."

type Cli =
    { Flags: TinyFlags
      Context: EvaluationContext
      Out: TextWriter
      Err: TextWriter }

let defaultContext () =
    { EvaluationContext.empty with
        SessionId = Some Environment.UserName }

let create () : Cli =
    { Flags = Flags.create ()
      Context = defaultContext ()
      Out = Console.Out
      Err = Console.Error }

let withWriters (out: TextWriter) (err: TextWriter) (cli: Cli) =
    { cli with Out = out; Err = err }

let private renderPet (cli: Cli) (pet: Pets.Pet) style =
    let longStayBadge = if Pets.isLongStay pet then " ★" else ""

    match style with
    | Compact ->
        cli.Out.WriteLine(
            sprintf "  %-10s %-14s %-10s %dy%s" pet.Slug pet.Name pet.Species pet.AgeYears longStayBadge
        )
    | Playful ->
        let tagText = String.concat " & " pet.Tags

        cli.Out.WriteLine(
            sprintf
                "  🐾 %s%s — a %d-year-old %s who is %s."
                pet.Name
                longStayBadge
                pet.AgeYears
                (pet.Breed.ToLowerInvariant())
                tagText
        )
    | Detailed ->
        cli.Out.WriteLine(sprintf "  %s%s  [%s]" pet.Name longStayBadge pet.Slug)
        cli.Out.WriteLine(sprintf "    %s, %d years old" pet.Breed pet.AgeYears)
        cli.Out.WriteLine(sprintf "    Tags: %s" (String.concat ", " pet.Tags))
        cli.Out.WriteLine()

let private renderCharity (cli: Cli) (charity: Charities.Charity) showRatings =
    cli.Out.WriteLine(sprintf "  %s  [%s]" charity.Name charity.Slug)
    cli.Out.WriteLine(sprintf "    Focus: %s" charity.Focus)
    cli.Out.WriteLine(sprintf "    %s" charity.Description)
    cli.Out.WriteLine(sprintf "    Donate: %s" charity.Url)
    if showRatings then
        cli.Out.WriteLine(sprintf "    Rating: %s" charity.RatingNote)

let private factorsForDepth depth =
    let take =
        match depth with
        | Short -> 2
        | Thorough -> 6
        | Standard -> 4

    allFactors |> List.truncate take

let browse (cli: Cli) (species: string option) =
    let pets = Pets.filterBySpecies species

    if List.isEmpty pets then
        let label = defaultArg species "<unspecified>"
        cli.Out.WriteLine(sprintf "No adoptable pets found for species '%s'." label)
        0
    else
        if cli.Flags |> TinyFlags.enabled Flags.LongStayHighlight cli.Context then
            let longStay =
                pets
                |> List.filter Pets.isLongStay
                |> List.sortByDescending (fun p -> p.DaysInShelter)
                |> List.tryHead

            match longStay with
            | Some pet ->
                cli.Out.WriteLine(sprintf "★ Featured long-stay friend — please consider %s!" pet.Name)
                cli.Out.WriteLine()
            | None -> ()

        let style =
            cli.Flags
            |> TinyFlags.variant Flags.PetCardStyle cli.Context
            |> parsePetCardStyle

        for pet in pets do
            renderPet cli pet style

        0

let show (cli: Cli) (slug: string) =
    match Pets.findBySlug slug with
    | None ->
        cli.Err.WriteLine(sprintf "Unknown pet '%s'. Try 'pawmatch browse'." slug)
        1
    | Some pet ->
        renderPet cli pet Detailed
        cli.Out.WriteLine(sprintf "  Needs: %s" pet.Needs)
        let longStaySuffix = if Pets.isLongStay pet then " (long-stay)" else ""
        cli.Out.WriteLine(sprintf "  Days in shelter: %d%s" pet.DaysInShelter longStaySuffix)
        0

let matchCommand (cli: Cli) (preferences: MatchPreferences.T) =
    let strategy =
        cli.Flags
        |> TinyFlags.variant Flags.RecommendationStrategy cli.Context
        |> parseMatchStrategy

    let depth =
        cli.Flags
        |> TinyFlags.variant Flags.MatchQuizDepth cli.Context
        |> parseMatchDepth

    let factors = factorsForDepth depth
    let userFlags = MatchPreferences.toFlagSet preferences

    let wants =
        factors
        |> List.fold
            (fun acc (factorFlag, tags) ->
                if Set.contains factorFlag userFlags then
                    tags |> List.fold (fun s t -> Set.add t s) acc
                else
                    acc)
            Set.empty

    cli.Out.WriteLine(
        sprintf
            "Strategy: %s • Quiz depth: %s (%d factor(s) considered)"
            (matchStrategyToKebab strategy)
            (matchDepthToKebab depth)
            (List.length factors)
    )

    if MatchPreferences.isEmpty preferences then
        cli.Out.WriteLine(
            "(no preference flags provided — try --has-kids --quiet-home --active --first-time)"
        )

    cli.Out.WriteLine()

    let scoreBy (tags: Set<string>) (pet: Pets.Pet) =
        pet.Tags |> List.filter tags.Contains |> List.length

    let ranked =
        match strategy with
        | Popularity -> Pets.all |> List.sortByDescending (scoreBy popularityTags)
        | LongestStay -> Pets.all |> List.sortByDescending (fun p -> p.DaysInShelter)
        | MatchQuiz -> Pets.all |> List.sortByDescending (scoreBy wants)

    for pet in ranked |> List.truncate 3 do
        cli.Out.WriteLine(
            sprintf "  • %s (%s, %dy) — %s" pet.Name pet.Breed pet.AgeYears (String.concat ", " pet.Tags)
        )

    cli.Out.WriteLine()
    cli.Out.WriteLine("Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
    0

let apply (cli: Cli) (slug: string) =
    match Pets.findBySlug slug with
    | None ->
        cli.Err.WriteLine(sprintf "Unknown pet '%s'. Try 'pawmatch browse'." slug)
        1
    | Some pet ->
        cli.Out.WriteLine(sprintf "Adoption application for %s" pet.Name)
        cli.Out.WriteLine()
        cli.Out.WriteLine("Next steps:")
        cli.Out.WriteLine("  1. Application reviewed by an adoption counselor (1–2 days).")
        cli.Out.WriteLine("  2. Meet-and-greet scheduled at the shelter.")
        cli.Out.WriteLine("  3. 48-hour reflection period before finalizing.")
        cli.Out.WriteLine("  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

        if cli.Flags |> TinyFlags.enabled Flags.HomeCheckFollowup cli.Context then
            cli.Out.WriteLine(
                "  5. Two-week follow-up check from a counselor to see how you're settling in."
            )

        cli.Out.WriteLine()
        cli.Out.WriteLine("Returns are always accepted, no questions asked.")

        if cli.Flags |> TinyFlags.enabled Flags.SuggestDonateAfterAdoption cli.Context then
            cli.Out.WriteLine()
            cli.Out.WriteLine(sprintf "If %s brings you joy, please consider donating to a shelter:" pet.Name)
            cli.Out.WriteLine("  pawmatch donate")

        0

let fees (cli: Cli) =
    cli.Out.WriteLine("Adoption fees")
    cli.Out.WriteLine()

    if cli.Flags |> TinyFlags.enabled Flags.FeeBreakdownDetailed cli.Context then
        cli.Out.WriteLine("  Dog adoption — $150 total:")
        cli.Out.WriteLine("    $60   spay / neuter surgery")
        cli.Out.WriteLine("    $45   core vaccinations")
        cli.Out.WriteLine("    $25   microchip and registration")
        cli.Out.WriteLine("    $20   intake exam and deworming")
        cli.Out.WriteLine()
        cli.Out.WriteLine("  Cat adoption — $90 total:")
        cli.Out.WriteLine("    $50   spay / neuter surgery")
        cli.Out.WriteLine("    $25   core vaccinations")
        cli.Out.WriteLine("    $15   microchip and registration")
        cli.Out.WriteLine()
        cli.Out.WriteLine("  Small animal — $35 total (intake exam + microchip).")
    else
        cli.Out.WriteLine("  Dog adoption           $150")
        cli.Out.WriteLine("  Cat adoption            $90")
        cli.Out.WriteLine("  Small animal            $35")
        cli.Out.WriteLine()
        cli.Out.WriteLine("  Fees cover spay/neuter, vaccines, and microchip.")

    cli.Out.WriteLine()
    cli.Out.WriteLine("No one is turned away for inability to pay — ask about our subsidy fund.")
    0

let returnSupport (cli: Cli) =
    cli.Out.WriteLine("Return support")
    cli.Out.WriteLine()
    cli.Out.WriteLine("If your adoption isn't working out, we're here to help.")
    cli.Out.WriteLine("  • Free behavior consultation with our trainers.")
    cli.Out.WriteLine("  • No-judgment returns at any time — your pet stays in our care.")
    cli.Out.WriteLine("  • Connections to low-cost vet and food assistance programs.")
    cli.Out.WriteLine()
    cli.Out.WriteLine("Returning a pet is not a failure. Reach out as soon as you'd like support.")
    0

let private openUrl (cli: Cli) (url: string) =
    try
        let psi =
            if OperatingSystem.IsWindows() then
                ProcessStartInfo(url, UseShellExecute = true)
            elif OperatingSystem.IsMacOS() then
                ProcessStartInfo("open", url)
            elif OperatingSystem.IsLinux() then
                ProcessStartInfo("xdg-open", url)
            else
                ProcessStartInfo(url, UseShellExecute = true)

        Process.Start(psi) |> ignore
        0
    with
    | :? System.ComponentModel.Win32Exception as ex ->
        cli.Err.WriteLine(sprintf "Unable to open browser (%s). URL: %s" (ex.GetType().Name) url)
        1
    | :? InvalidOperationException as ex ->
        cli.Err.WriteLine(sprintf "Unable to open browser (%s). URL: %s" (ex.GetType().Name) url)
        1
    | :? PlatformNotSupportedException as ex ->
        cli.Err.WriteLine(sprintf "Unable to open browser (%s). URL: %s" (ex.GetType().Name) url)
        1

let donate (cli: Cli) (charitySlug: string option) (focusOverride: string option) (openBrowser: bool) =
    let defaultFocus =
        cli.Flags
        |> TinyFlags.variant Flags.DonateFocusDefault cli.Context
        |> parseDonateFocus

    let focus = defaultArg focusOverride (donateFocusToKebab defaultFocus)
    let showRatings = cli.Flags |> TinyFlags.enabled Flags.ShowCharityRatings cli.Context

    match charitySlug with
    | Some slug ->
        match Charities.findBySlug slug with
        | None ->
            cli.Err.WriteLine(sprintf "Unknown charity '%s'." slug)
            1
        | Some charity ->
            if openBrowser then
                openUrl cli charity.Url
            else
                renderCharity cli charity showRatings
                0
    | None ->
        let list = Charities.filterByFocus focus
        cli.Out.WriteLine(sprintf "Animal-welfare charities (focus: %s)" focus)
        cli.Out.WriteLine()

        for charity in list do
            renderCharity cli charity showRatings
            cli.Out.WriteLine()

        cli.Out.WriteLine(Charities.disclaimer)

        if not showRatings then
            cli.Out.WriteLine("Ratings hidden — set show-charity-ratings to surface them inline.")

        0

let private preferencesOf (results: ParseResults<MatchArgs>) =
    { MatchPreferences.empty with
        HasKids = results.Contains Has_Kids
        QuietHome = results.Contains Quiet_Home
        Active = results.Contains Active
        FirstTime = results.Contains First_Time
        MultiplePets = results.Contains Multiple_Pets
        SmallHome = results.Contains Small_Home }

let runCommand (cli: Cli) (command: PawMatchCommand) =
    match command with
    | Browse args -> browse cli (args.TryGetResult BrowseArgs.Species)
    | Show args -> show cli (args.GetResult ShowArgs.Pet)
    | Match args -> matchCommand cli (preferencesOf args)
    | Apply args -> apply cli (args.GetResult ApplyArgs.Pet)
    | Fees -> fees cli
    | ReturnSupport -> returnSupport cli
    | Donate args ->
        donate
            cli
            (args.TryGetResult DonateArgs.Charity)
            (args.TryGetResult DonateArgs.Focus)
            (args.Contains DonateArgs.Open_Browser)

let createParser () =
    ArgumentParser.Create<PawMatchCommand>(programName = "pawmatch", errorHandler = ProcessExiter())

let run (cli: Cli) (argv: string[]) =
    let parser = createParser ()
    let results = parser.ParseCommandLine(argv, raiseOnUsage = false)

    if results.IsUsageRequested || results.GetAllResults() |> List.isEmpty then
        cli.Out.WriteLine(parser.PrintUsage(message = "pawmatch — community pet adoption CLI."))
        0
    else
        let commands = results.GetAllResults()

        match commands with
        | [ command ] -> runCommand cli command
        | _ ->
            cli.Err.WriteLine("Specify exactly one pawmatch subcommand.")
            1
