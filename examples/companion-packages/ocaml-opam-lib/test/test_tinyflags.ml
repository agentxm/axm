(* Alcotest unit tests for the TinyFlags OCaml library. Covers default
   behavior, rollout boundaries, variant validation, and deterministic
   bucketing. *)

open Tinyflags

let ctx (id : string) : Context.t = Context.make ~id ()

(* ── Boolean defaults ─────────────────────────────────────────────── *)

let test_bool_default_when_no_rollout () =
  let flags =
    make_exn [ ("checkout-redesign", Boolean (Bool.make_exn ~default:true ())) ]
  in
  Alcotest.(check bool)
    "default returned when no rollout" true
    (enabled_exn flags ~name:"checkout-redesign" ~context:(ctx "user-1"))

let test_bool_defaults_to_false_when_default_omitted () =
  let flags = make_exn [ ("experiment", Boolean (Bool.make_exn ())) ] in
  Alcotest.(check bool)
    "implicit default is false" false
    (enabled_exn flags ~name:"experiment" ~context:(ctx "user-1"))

(* ── Boolean rollout boundaries ───────────────────────────────────── *)

let test_bool_rollout_zero_never_flips () =
  let flags =
    make_exn
      [ ("off", Boolean (Bool.make_exn ~default:false ~rollout:0 ())) ]
  in
  List.iter
    (fun id ->
      Alcotest.(check bool)
        ("rollout 0 returns default for " ^ id)
        false
        (enabled_exn flags ~name:"off" ~context:(ctx id)))
    [ "user-1"; "alice"; "bob"; "carol"; "dave"; "eve"; "" ]

let test_bool_rollout_100_always_flips () =
  let flags =
    make_exn
      [ ("on", Boolean (Bool.make_exn ~default:false ~rollout:100 ())) ]
  in
  List.iter
    (fun id ->
      Alcotest.(check bool)
        ("rollout 100 returns not-default for " ^ id)
        true
        (enabled_exn flags ~name:"on" ~context:(ctx id)))
    [ "user-1"; "alice"; "bob"; "carol"; "dave"; "eve"; "" ]

let test_bool_rollout_deterministic () =
  let flags =
    make_exn
      [
        ( "experiment",
          Boolean (Bool.make_exn ~default:false ~rollout:37 ()) );
      ]
  in
  let c = ctx "user-42" in
  let first = enabled_exn flags ~name:"experiment" ~context:c in
  for _ = 1 to 100 do
    Alcotest.(check bool)
      "deterministic across calls" first
      (enabled_exn flags ~name:"experiment" ~context:c)
  done

(* ── Variant defaults ─────────────────────────────────────────────── *)

let test_variant_default_when_no_rollout () =
  let flags =
    make_exn
      [
        ( "search-ranking",
          VariantFlag
            (Variant.make_exn ~default:"classic" [ "classic"; "semantic" ]) );
      ]
  in
  Alcotest.(check string)
    "variant default returned" "classic"
    (variant_exn flags ~name:"search-ranking" ~context:(ctx "user-1"))

let test_variant_first_is_default () =
  let flags =
    make_exn
      [ ("ranking", VariantFlag (Variant.make_exn [ "a"; "b"; "c" ])) ]
  in
  Alcotest.(check string)
    "first variant is implicit default" "a"
    (variant_exn flags ~name:"ranking" ~context:(ctx "user-1"))

let test_variant_rollout_100_routes_all () =
  let flags =
    make_exn
      [
        ( "search-ranking",
          VariantFlag
            (Variant.make_exn ~default:"classic"
               ~rollout:[ ("semantic", 100) ]
               [ "classic"; "semantic" ]) );
      ]
  in
  List.iter
    (fun id ->
      Alcotest.(check string)
        ("rollout 100% routes everyone for " ^ id)
        "semantic"
        (variant_exn flags ~name:"search-ranking" ~context:(ctx id)))
    [ "alice"; "bob"; "carol"; "dave" ]

(* ── Variant validation ───────────────────────────────────────────── *)

let test_variant_rejects_unknown_default () =
  match
    Variant.make ~default:"personalized" [ "classic"; "semantic" ]
  with
  | Error (Invalid_default _) -> ()
  | Error e ->
      Alcotest.failf "expected Invalid_default, got: %s" (error_message e)
  | Ok _ -> Alcotest.fail "expected Error for unknown default"

let test_variant_rejects_unknown_rollout_key () =
  match
    Variant.make ~rollout:[ ("personalized", 50) ] [ "classic"; "semantic" ]
  with
  | Error (Unknown_variant _) -> ()
  | Error e ->
      Alcotest.failf "expected Unknown_variant, got: %s" (error_message e)
  | Ok _ -> Alcotest.fail "expected Error for unknown rollout key"

let test_variant_rejects_total_over_100 () =
  match
    Variant.make
      ~rollout:[ ("classic", 80); ("semantic", 30) ]
      [ "classic"; "semantic" ]
  with
  | Error (Rollout_total_exceeds_100 _) -> ()
  | Error e ->
      Alcotest.failf "expected Rollout_total_exceeds_100, got: %s"
        (error_message e)
  | Ok _ -> Alcotest.fail "expected Error for rollout > 100"

let test_variant_rejects_duplicate () =
  match Variant.make [ "a"; "a" ] with
  | Error (Duplicate_variant _) -> ()
  | Error e ->
      Alcotest.failf "expected Duplicate_variant, got: %s" (error_message e)
  | Ok _ -> Alcotest.fail "expected Error for duplicate variant"

let test_variant_rejects_empty () =
  match Variant.make [] with
  | Error Empty_variants -> ()
  | Error e ->
      Alcotest.failf "expected Empty_variants, got: %s" (error_message e)
  | Ok _ -> Alcotest.fail "expected Error for empty variant list"

let test_bool_rejects_out_of_range_rollout () =
  (match Bool.make ~rollout:(-1) () with
  | Error (Invalid_rollout _) -> ()
  | _ -> Alcotest.fail "expected error for rollout=-1");
  match Bool.make ~rollout:101 () with
  | Error (Invalid_rollout _) -> ()
  | _ -> Alcotest.fail "expected error for rollout=101"

(* ── Evaluate dispatch and unknown flag ───────────────────────────── *)

let test_evaluate_dispatches () =
  let flags =
    make_exn
      [
        ("toggle", Boolean (Bool.make_exn ~default:true ()));
        ( "strategy",
          VariantFlag (Variant.make_exn ~default:"b" [ "a"; "b" ]) );
      ]
  in
  (match evaluate flags ~name:"toggle" ~context:(ctx "x") with
  | Ok (Bool_value true) -> ()
  | _ -> Alcotest.fail "expected Bool_value true");
  match evaluate flags ~name:"strategy" ~context:(ctx "x") with
  | Ok (Variant_value "b") -> ()
  | _ -> Alcotest.fail "expected Variant_value b"

let test_unknown_flag_is_error () =
  let flags = make_exn [] in
  match enabled flags ~name:"missing" ~context:(ctx "x") with
  | Error (Unknown_flag _) -> ()
  | _ -> Alcotest.fail "expected Unknown_flag error"

let test_names_sorted () =
  let flags =
    make_exn
      [
        ("b", Boolean (Bool.make_exn ()));
        ("a", Boolean (Bool.make_exn ()));
        ("c", VariantFlag (Variant.make_exn [ "x" ]));
      ]
  in
  Alcotest.(check (list string))
    "names are sorted lexicographically" [ "a"; "b"; "c" ] (names flags)

(* ── Suite ────────────────────────────────────────────────────────── *)

let () =
  Alcotest.run "tinyflags"
    [
      ( "boolean defaults",
        [
          Alcotest.test_case "default returned" `Quick
            test_bool_default_when_no_rollout;
          Alcotest.test_case "implicit default false" `Quick
            test_bool_defaults_to_false_when_default_omitted;
        ] );
      ( "boolean rollout",
        [
          Alcotest.test_case "rollout 0 never flips" `Quick
            test_bool_rollout_zero_never_flips;
          Alcotest.test_case "rollout 100 always flips" `Quick
            test_bool_rollout_100_always_flips;
          Alcotest.test_case "deterministic" `Quick
            test_bool_rollout_deterministic;
          Alcotest.test_case "rejects out of range" `Quick
            test_bool_rejects_out_of_range_rollout;
        ] );
      ( "variant defaults",
        [
          Alcotest.test_case "default returned" `Quick
            test_variant_default_when_no_rollout;
          Alcotest.test_case "first is implicit default" `Quick
            test_variant_first_is_default;
          Alcotest.test_case "rollout 100% routes all" `Quick
            test_variant_rollout_100_routes_all;
        ] );
      ( "variant validation",
        [
          Alcotest.test_case "rejects unknown default" `Quick
            test_variant_rejects_unknown_default;
          Alcotest.test_case "rejects unknown rollout key" `Quick
            test_variant_rejects_unknown_rollout_key;
          Alcotest.test_case "rejects rollout total > 100" `Quick
            test_variant_rejects_total_over_100;
          Alcotest.test_case "rejects duplicate variants" `Quick
            test_variant_rejects_duplicate;
          Alcotest.test_case "rejects empty variants" `Quick
            test_variant_rejects_empty;
        ] );
      ( "dispatch and names",
        [
          Alcotest.test_case "evaluate dispatches by kind" `Quick
            test_evaluate_dispatches;
          Alcotest.test_case "unknown flag is error" `Quick
            test_unknown_flag_is_error;
          Alcotest.test_case "names sorted" `Quick test_names_sorted;
        ] );
    ]
