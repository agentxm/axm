(* Flag definitions for the PawMatch app. Each flag is wired into at least
   one command's code path so the companion skills have realistic targets. *)

open Tinyflags

(* Flag name constants — string-literal sharing keeps callsites concise. *)
let home_check_followup = "home-check-followup"
let fee_breakdown_detailed = "fee-breakdown-detailed"
let long_stay_highlight = "long-stay-highlight"
let suggest_donate_after_adoption = "suggest-donate-after-adoption"
let show_charity_ratings = "show-charity-ratings"
let recommendation_strategy = "recommendation-strategy"
let match_quiz_depth = "match-quiz-depth"
let pet_card_style = "pet-card-style"
let donate_focus_default = "donate-focus-default"

let build_registry () : Tinyflags.t =
  make_exn
    [
      ( home_check_followup,
        Boolean (Bool.make_exn ~default:false ~rollout:25 ()) );
      (fee_breakdown_detailed, Boolean (Bool.make_exn ~default:true ()));
      (long_stay_highlight, Boolean (Bool.make_exn ~default:true ()));
      ( suggest_donate_after_adoption,
        Boolean (Bool.make_exn ~default:false ~rollout:50 ()) );
      (show_charity_ratings, Boolean (Bool.make_exn ~default:true ()));
      ( recommendation_strategy,
        VariantFlag
          (Variant.make_exn ~default:"match-quiz"
             ~rollout:[ ("longest-stay", 20) ]
             [ "popularity"; "match-quiz"; "longest-stay" ]) );
      ( match_quiz_depth,
        VariantFlag
          (Variant.make_exn ~default:"standard"
             [ "short"; "standard"; "thorough" ]) );
      ( pet_card_style,
        VariantFlag
          (Variant.make_exn ~default:"detailed"
             [ "compact"; "detailed"; "playful" ]) );
      ( donate_focus_default,
        VariantFlag
          (Variant.make_exn ~default:"all" [ "all"; "shelters"; "rescue" ])
      );
    ]
