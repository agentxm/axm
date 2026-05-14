module AgentXM.Examples.PawMatch.FSharp.Variants

type PetCardStyle =
    | Compact
    | Detailed
    | Playful

type MatchStrategy =
    | Popularity
    | MatchQuiz
    | LongestStay

type MatchDepth =
    | Short
    | Standard
    | Thorough

type DonateFocus =
    | All
    | Shelters
    | Rescue

let private petCardStyleFromKebab =
    function
    | "compact" -> Compact
    | "detailed" -> Detailed
    | "playful" -> Playful
    | other -> invalidOp $"Unknown PetCardStyle variant '{other}'."

let private matchStrategyFromKebab =
    function
    | "popularity" -> Popularity
    | "match-quiz" -> MatchQuiz
    | "longest-stay" -> LongestStay
    | other -> invalidOp $"Unknown MatchStrategy variant '{other}'."

let private matchDepthFromKebab =
    function
    | "short" -> Short
    | "standard" -> Standard
    | "thorough" -> Thorough
    | other -> invalidOp $"Unknown MatchDepth variant '{other}'."

let private donateFocusFromKebab =
    function
    | "all" -> All
    | "shelters" -> Shelters
    | "rescue" -> Rescue
    | other -> invalidOp $"Unknown DonateFocus variant '{other}'."

let parsePetCardStyle = petCardStyleFromKebab
let parseMatchStrategy = matchStrategyFromKebab
let parseMatchDepth = matchDepthFromKebab
let parseDonateFocus = donateFocusFromKebab

let petCardStyleToKebab =
    function
    | Compact -> "compact"
    | Detailed -> "detailed"
    | Playful -> "playful"

let matchStrategyToKebab =
    function
    | Popularity -> "popularity"
    | MatchQuiz -> "match-quiz"
    | LongestStay -> "longest-stay"

let matchDepthToKebab =
    function
    | Short -> "short"
    | Standard -> "standard"
    | Thorough -> "thorough"

let donateFocusToKebab =
    function
    | All -> "all"
    | Shelters -> "shelters"
    | Rescue -> "rescue"
