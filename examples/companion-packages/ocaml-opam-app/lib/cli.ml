(* Command-line entrypoint for the pawmatch example app. Argument parsing is
   intentionally done with a tiny hand-rolled subcommand dispatcher so the
   surface area is easy to read. *)

open Tinyflags

let usage : string =
  String.concat "\n"
    [
      "pawmatch — community pet-adoption CLI.";
      "";
      "Usage: pawmatch <command> [options]";
      "";
      "Commands:";
      "  browse [--species SPECIES]   List adoptable pets";
      "  show <pet>                   Show details for a pet";
      "  match [match flags]          Match pets to your lifestyle";
      "  apply <pet>                  Start an adoption application";
      "  fees                         Show adoption fees";
      "  return-support               No-judgment return information";
      "  donate [--focus FOCUS]       Browse charities to support";
      "  donate <slug> --open         Open a charity's donation URL";
    ]

let popularity_tags : string list =
  [ "social"; "good-with-kids"; "calm"; "mellow"; "gentle" ]

(* Ordered (factor flag, [matching pet tags]) pairs. The quiz depth variant
   controls how many of these are considered. *)
let all_factors : (string * string list) list =
  [
    ("has-kids", [ "good-with-kids"; "gentle" ]);
    ("quiet-home", [ "mellow"; "calm"; "solo"; "lap-cat" ]);
    ("active", [ "high-energy"; "playful" ]);
    ("first-time", [ "gentle"; "calm"; "low-energy" ]);
    ("multiple-pets", [ "social" ]);
    ("small-home", [ "lap-cat"; "solo"; "low-energy" ]);
  ]

let session_id () : string =
  match Sys.getenv_opt "USER" with
  | Some u when u <> "" -> u
  | _ -> ( match Sys.getenv_opt "USERNAME" with Some u -> u | None -> "anonymous")

let context () : Context.t = Context.make ~id:(session_id ()) ()

(* ── helpers ────────────────────────────────────────────────────── *)

type output = {
  print : string -> unit;
  print_err : string -> unit;
}

let factors_for_depth (depth : string) : (string * string list) list =
  let take =
    match depth with "short" -> 2 | "thorough" -> 6 | _ -> 4
  in
  let rec first n xs =
    if n <= 0 then []
    else match xs with [] -> [] | x :: rest -> x :: first (n - 1) rest
  in
  first take all_factors

let render_pet (pet : Pets.t) (style : string) ~print : unit =
  let badge = if Pets.long_stay pet then " *" else "" in
  match style with
  | "compact" ->
      print
        (Printf.sprintf "  %-10s %-14s %-10s %dy%s" pet.slug pet.name
           pet.species pet.age_years badge)
  | "playful" ->
      let tag_phrase = String.concat " & " pet.tags in
      print
        (Printf.sprintf
           "  paw %s%s — a %d-year-old %s who is %s." pet.name badge
           pet.age_years
           (String.lowercase_ascii pet.breed)
           tag_phrase)
  | _ ->
      print (Printf.sprintf "  %s%s  [%s]" pet.name badge pet.slug);
      print
        (Printf.sprintf "    %s, %d years old" pet.breed pet.age_years);
      print (Printf.sprintf "    Tags: %s" (String.concat ", " pet.tags));
      print ""

let render_charity (c : Charities.t) ~show_ratings ~print : unit =
  print (Printf.sprintf "  %s  [%s]" c.name c.slug);
  print (Printf.sprintf "    Focus: %s" c.focus);
  print (Printf.sprintf "    %s" c.description);
  print (Printf.sprintf "    Donate: %s" c.url);
  if show_ratings then print (Printf.sprintf "    Rating: %s" c.rating_note)

(* ── argument parsing helpers ───────────────────────────────────── *)

(* Pull `--key value` out of a string list and return (value option, rest). *)
let take_option_value (key : string) (args : string list) :
    string option * string list =
  let rec go acc = function
    | [] -> (None, List.rev acc)
    | k :: v :: rest when k = key -> (Some v, List.rev_append acc rest)
    | x :: rest -> go (x :: acc) rest
  in
  go [] args

(* Pull a boolean flag out of a string list and return (present, rest). *)
let take_bool_flag (key : string) (args : string list) : bool * string list =
  let rec go acc = function
    | [] -> (false, List.rev acc)
    | k :: rest when k = key -> (true, List.rev_append acc rest)
    | x :: rest -> go (x :: acc) rest
  in
  go [] args

(* ── command implementations ────────────────────────────────────── *)

let cmd_browse (args : string list) (out : output) : int =
  let species, rest = take_option_value "--species" args in
  ignore rest;
  let matching = Pets.filter_by_species species in
  if matching = [] then (
    let label = match species with Some s -> s | None -> "" in
    out.print
      (Printf.sprintf "No adoptable pets found for species '%s'." label);
    0)
  else
    let flags = Flags.build_registry () in
    let ctx = context () in
    (if enabled_exn flags ~name:Flags.long_stay_highlight ~context:ctx then
       let long_stay =
         List.sort
           (fun (a : Pets.t) (b : Pets.t) ->
             compare b.days_in_shelter a.days_in_shelter)
           (List.filter Pets.long_stay matching)
       in
       match long_stay with
       | featured :: _ ->
           out.print
             (Printf.sprintf
                "* Featured long-stay friend — please consider %s!"
                featured.name);
           out.print ""
       | [] -> ());
    let style = variant_exn flags ~name:Flags.pet_card_style ~context:ctx in
    List.iter (fun pet -> render_pet pet style ~print:out.print) matching;
    0

let cmd_show (args : string list) (out : output) : int =
  match args with
  | [] ->
      out.print_err "Usage: pawmatch show <pet>";
      1
  | slug :: _ -> (
      match Pets.find_by_slug slug with
      | None ->
          out.print_err
            (Printf.sprintf "Unknown pet '%s'. Try 'pawmatch browse'." slug);
          1
      | Some pet ->
          render_pet pet "detailed" ~print:out.print;
          out.print (Printf.sprintf "  Needs: %s" pet.needs);
          let suffix = if Pets.long_stay pet then " (long-stay)" else "" in
          out.print
            (Printf.sprintf "  Days in shelter: %d%s" pet.days_in_shelter
               suffix);
          0)

type match_prefs = {
  has_kids : bool;
  quiet_home : bool;
  active : bool;
  first_time : bool;
  multiple_pets : bool;
  small_home : bool;
}

let parse_match_prefs (args : string list) : match_prefs =
  let has_kids, args = take_bool_flag "--has-kids" args in
  let quiet_home, args = take_bool_flag "--quiet-home" args in
  let active, args = take_bool_flag "--active" args in
  let first_time, args = take_bool_flag "--first-time" args in
  let multiple_pets, args = take_bool_flag "--multiple-pets" args in
  let small_home, _ = take_bool_flag "--small-home" args in
  { has_kids; quiet_home; active; first_time; multiple_pets; small_home }

let pref_value (p : match_prefs) (factor : string) : bool =
  match factor with
  | "has-kids" -> p.has_kids
  | "quiet-home" -> p.quiet_home
  | "active" -> p.active
  | "first-time" -> p.first_time
  | "multiple-pets" -> p.multiple_pets
  | "small-home" -> p.small_home
  | _ -> false

let any_pref (p : match_prefs) : bool =
  p.has_kids || p.quiet_home || p.active || p.first_time || p.multiple_pets
  || p.small_home

let cmd_match (args : string list) (out : output) : int =
  let prefs = parse_match_prefs args in
  let flags = Flags.build_registry () in
  let ctx = context () in
  let strategy =
    variant_exn flags ~name:Flags.recommendation_strategy ~context:ctx
  in
  let depth = variant_exn flags ~name:Flags.match_quiz_depth ~context:ctx in
  let factors = factors_for_depth depth in
  let wants =
    List.concat_map
      (fun (factor, tags) -> if pref_value prefs factor then tags else [])
      factors
  in
  out.print
    (Printf.sprintf "Strategy: %s • Quiz depth: %s (%d factor(s) considered)"
       strategy depth (List.length factors));
  if not (any_pref prefs) then
    out.print
      "(no preference flags provided — try --has-kids --quiet-home --active \
       --first-time)";
  out.print "";
  let count_in (pet : Pets.t) (wanted : string list) : int =
    List.fold_left
      (fun n t -> if List.mem t wanted then n + 1 else n)
      0 pet.tags
  in
  let ranked =
    match strategy with
    | "popularity" ->
        List.sort
          (fun (a : Pets.t) (b : Pets.t) ->
            compare (count_in b popularity_tags) (count_in a popularity_tags))
          Pets.all
    | "longest-stay" ->
        List.sort
          (fun (a : Pets.t) (b : Pets.t) ->
            compare b.days_in_shelter a.days_in_shelter)
          Pets.all
    | _ ->
        List.sort
          (fun (a : Pets.t) (b : Pets.t) ->
            compare (count_in b wants) (count_in a wants))
          Pets.all
  in
  let rec first n = function
    | [] -> []
    | _ when n <= 0 -> []
    | x :: rest -> x :: first (n - 1) rest
  in
  List.iter
    (fun (pet : Pets.t) ->
      out.print
        (Printf.sprintf "  • %s (%s, %dy) — %s" pet.name pet.breed
           pet.age_years
           (String.concat ", " pet.tags)))
    (first 3 ranked);
  out.print "";
  out.print
    "Adoption is a conversation — book a meet-and-greet to see if it's a fit.";
  0

let cmd_apply (args : string list) (out : output) : int =
  match args with
  | [] ->
      out.print_err "Usage: pawmatch apply <pet>";
      1
  | slug :: _ -> (
      match Pets.find_by_slug slug with
      | None ->
          out.print_err
            (Printf.sprintf "Unknown pet '%s'. Try 'pawmatch browse'." slug);
          1
      | Some pet ->
          out.print (Printf.sprintf "Adoption application for %s" pet.name);
          out.print "";
          out.print "Next steps:";
          out.print
            "  1. Application reviewed by an adoption counselor (1-2 days).";
          out.print "  2. Meet-and-greet scheduled at the shelter.";
          out.print "  3. 48-hour reflection period before finalizing.";
          out.print
            "  4. Take-home day — fees cover spay/neuter, vaccines, and \
             microchip.";
          let flags = Flags.build_registry () in
          let ctx = context () in
          if
            enabled_exn flags ~name:Flags.home_check_followup ~context:ctx
          then
            out.print
              "  5. Two-week follow-up check from a counselor to see how \
               you're settling in.";
          out.print "";
          out.print "Returns are always accepted, no questions asked.";
          if
            enabled_exn flags ~name:Flags.suggest_donate_after_adoption
              ~context:ctx
          then (
            out.print "";
            out.print
              (Printf.sprintf
                 "If %s brings you joy, please consider donating to a shelter:"
                 pet.name);
            out.print "  pawmatch donate");
          0)

let cmd_fees (_args : string list) (out : output) : int =
  let flags = Flags.build_registry () in
  let ctx = context () in
  out.print "Adoption fees";
  out.print "";
  if enabled_exn flags ~name:Flags.fee_breakdown_detailed ~context:ctx then (
    out.print "  Dog adoption — $150 total:";
    out.print "    $60   spay / neuter surgery";
    out.print "    $45   core vaccinations";
    out.print "    $25   microchip and registration";
    out.print "    $20   intake exam and deworming";
    out.print "";
    out.print "  Cat adoption — $90 total:";
    out.print "    $50   spay / neuter surgery";
    out.print "    $25   core vaccinations";
    out.print "    $15   microchip and registration";
    out.print "";
    out.print "  Small animal — $35 total (intake exam + microchip).")
  else (
    out.print "  Dog adoption           $150";
    out.print "  Cat adoption            $90";
    out.print "  Small animal            $35";
    out.print "";
    out.print "  Fees cover spay/neuter, vaccines, and microchip.");
  out.print "";
  out.print
    "No one is turned away for inability to pay — ask about our subsidy fund.";
  0

let cmd_return_support (_args : string list) (out : output) : int =
  out.print "Return support";
  out.print "";
  out.print "If your adoption isn't working out, we're here to help.";
  out.print "  • Free behavior consultation with our trainers.";
  out.print
    "  • No-judgment returns at any time — your pet stays in our care.";
  out.print
    "  • Connections to low-cost vet and food assistance programs.";
  out.print "";
  out.print
    "Returning a pet is not a failure. Reach out as soon as you'd like \
     support.";
  0

let open_url (url : string) (out : output) : int =
  let cmd =
    match Sys.os_type with
    | "Unix" -> (
        (* Approximate macOS detection. *)
        let uname =
          try
            let ic = Unix.open_process_in "uname 2>/dev/null" in
            let line = try input_line ic with End_of_file -> "" in
            let _ = Unix.close_process_in ic in
            line
          with _ -> ""
        in
        if uname = "Darwin" then Some [| "open"; url |]
        else Some [| "xdg-open"; url |])
    | "Win32" -> Some [| "cmd"; "/c"; "start"; ""; url |]
    | _ -> None
  in
  match cmd with
  | None ->
      out.print_err
        (Printf.sprintf "Unable to open browser on this platform. URL: %s"
           url);
      1
  | Some argv -> (
      try
        let pid =
          Unix.create_process argv.(0) argv Unix.stdin Unix.stdout Unix.stderr
        in
        ignore pid;
        0
      with Unix.Unix_error _ ->
        out.print_err
          (Printf.sprintf "Unable to open browser. URL: %s" url);
        1)

let cmd_donate (args : string list) (out : output) : int =
  let focus, args = take_option_value "--focus" args in
  let open_flag, args = take_bool_flag "--open" args in
  let charity_slug = match args with x :: _ -> Some x | [] -> None in
  let flags = Flags.build_registry () in
  let ctx = context () in
  let default_focus =
    variant_exn flags ~name:Flags.donate_focus_default ~context:ctx
  in
  let effective_focus =
    match focus with Some f -> f | None -> default_focus
  in
  let show_ratings =
    enabled_exn flags ~name:Flags.show_charity_ratings ~context:ctx
  in
  match charity_slug with
  | Some slug -> (
      match Charities.find_by_slug slug with
      | None ->
          out.print_err (Printf.sprintf "Unknown charity '%s'." slug);
          1
      | Some target when open_flag -> open_url target.url out
      | Some target ->
          render_charity target ~show_ratings ~print:out.print;
          0)
  | None ->
      let listing = Charities.filter_by_focus effective_focus in
      out.print
        (Printf.sprintf "Animal-welfare charities (focus: %s)" effective_focus);
      out.print "";
      List.iter
        (fun c ->
          render_charity c ~show_ratings ~print:out.print;
          out.print "")
        listing;
      out.print Charities.disclaimer;
      if not show_ratings then
        out.print
          "Ratings hidden — set show-charity-ratings to surface them inline.";
      0

(* ── dispatcher ─────────────────────────────────────────────────── *)

let run ?(stdout = print_endline)
    ?(stderr = fun s -> output_string Stdlib.stderr (s ^ "\n"))
    (argv : string list) : int =
  let out = { print = stdout; print_err = stderr } in
  match argv with
  | [] | [ "-h" ] | [ "--help" ] ->
      out.print usage;
      0
  | "browse" :: rest -> cmd_browse rest out
  | "show" :: rest -> cmd_show rest out
  | "match" :: rest -> cmd_match rest out
  | "apply" :: rest -> cmd_apply rest out
  | "fees" :: rest -> cmd_fees rest out
  | "return-support" :: rest -> cmd_return_support rest out
  | "donate" :: rest -> cmd_donate rest out
  | unknown :: _ ->
      out.print_err (Printf.sprintf "Unknown command: %s" unknown);
      out.print_err usage;
      1
