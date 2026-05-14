(* Alcotest cases for the pawmatch CLI. Each test runs [Pawmatch.Cli.run]
   in-process with captured stdout/stderr buffers. *)

let run_cli (args : string list) : int * string * string =
  let out_buf = Buffer.create 256 in
  let err_buf = Buffer.create 64 in
  let print s =
    Buffer.add_string out_buf s;
    Buffer.add_char out_buf '\n'
  in
  let print_err s =
    Buffer.add_string err_buf s;
    Buffer.add_char err_buf '\n'
  in
  let status =
    Pawmatch.Cli.run ~stdout:print ~stderr:print_err args
  in
  (status, Buffer.contents out_buf, Buffer.contents err_buf)

let contains (haystack : string) (needle : string) : bool =
  let h = haystack and n = needle in
  let lh = String.length h and ln = String.length n in
  if ln = 0 then true
  else
    let rec go i =
      if i + ln > lh then false
      else if String.sub h i ln = n then true
      else go (i + 1)
    in
    go 0

let check_contains label out needle =
  Alcotest.(check bool) label true (contains out needle)

let check_not_contains label out needle =
  Alcotest.(check bool) label false (contains out needle)

(* ── tests ──────────────────────────────────────────────────────── *)

let test_no_args_prints_usage () =
  let status, out, _err = run_cli [] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "mentions pawmatch" out "pawmatch";
  check_contains "lists commands" out "Commands:"

let test_fees_exit_zero () =
  let status, out, _err = run_cli [ "fees" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "fees header" out "Adoption fees"

let test_browse_lists_pets () =
  let status, out, _err = run_cli [ "browse" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "lists Biscuit" out "Biscuit"

let test_browse_species_filter () =
  let status, out, _err = run_cli [ "browse"; "--species"; "cat" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "shows Pepper" out "Pepper";
  check_not_contains "hides Biscuit" out "Biscuit"

let test_browse_unknown_species () =
  let status, out, _err = run_cli [ "browse"; "--species"; "dragon" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "no pets msg" out "No adoptable pets found"

let test_show_known_pet () =
  let status, out, _err = run_cli [ "show"; "pepper" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "shows Pepper" out "Pepper";
  check_contains "shows needs" out "Needs:"

let test_show_unknown_pet () =
  let status, _out, err = run_cli [ "show"; "nope" ] in
  Alcotest.(check int) "exit 1" 1 status;
  check_contains "error message" err "Unknown pet"

let test_match_with_flags () =
  let status, out, _err =
    run_cli [ "match"; "--has-kids"; "--active" ]
  in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "strategy line" out "Strategy:";
  check_contains "quiz depth line" out "Quiz depth:"

let test_apply_known_pet () =
  let status, out, _err = run_cli [ "apply"; "biscuit" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "application header" out "Adoption application for Biscuit";
  check_contains "mentions meet-and-greet" out "Meet-and-greet"

let test_apply_unknown_pet () =
  let status, _out, err = run_cli [ "apply"; "nope" ] in
  Alcotest.(check int) "exit 1" 1 status;
  check_contains "error message" err "Unknown pet"

let test_return_support () =
  let status, out, _err = run_cli [ "return-support" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "header" out "Return support";
  check_contains "no-judgment" out "No-judgment"

let test_donate_lists_charities () =
  let status, out, _err = run_cli [ "donate" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "header" out "Animal-welfare charities";
  check_contains "lists Best Friends" out "Best Friends"

let test_donate_focus_filter () =
  let status, out, _err = run_cli [ "donate"; "--focus"; "rescue" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "shows Brother Wolf" out "Brother Wolf";
  check_not_contains "hides Best Friends Animal Society" out
    "Best Friends Animal Society"

let test_donate_known_slug () =
  let status, out, _err = run_cli [ "donate"; "brother-wolf" ] in
  Alcotest.(check int) "exit 0" 0 status;
  check_contains "shows Brother Wolf" out "Brother Wolf"

let test_donate_unknown_slug () =
  let status, _out, err = run_cli [ "donate"; "not-a-charity" ] in
  Alcotest.(check int) "exit 1" 1 status;
  check_contains "error message" err "Unknown charity"

let test_unknown_command () =
  let status, _out, err = run_cli [ "teleport" ] in
  Alcotest.(check int) "exit 1" 1 status;
  check_contains "error message" err "Unknown command"

(* ── Suite ──────────────────────────────────────────────────────── *)

let () =
  Alcotest.run "pawmatch-cli"
    [
      ( "help",
        [
          Alcotest.test_case "no args prints usage" `Quick
            test_no_args_prints_usage;
        ] );
      ( "browse",
        [
          Alcotest.test_case "lists pets" `Quick test_browse_lists_pets;
          Alcotest.test_case "species filter" `Quick
            test_browse_species_filter;
          Alcotest.test_case "unknown species" `Quick
            test_browse_unknown_species;
        ] );
      ( "show",
        [
          Alcotest.test_case "known pet" `Quick test_show_known_pet;
          Alcotest.test_case "unknown pet" `Quick test_show_unknown_pet;
        ] );
      ( "match",
        [ Alcotest.test_case "with flags" `Quick test_match_with_flags ] );
      ( "apply",
        [
          Alcotest.test_case "known pet" `Quick test_apply_known_pet;
          Alcotest.test_case "unknown pet" `Quick test_apply_unknown_pet;
        ] );
      ("fees", [ Alcotest.test_case "exit zero" `Quick test_fees_exit_zero ]);
      ( "return-support",
        [ Alcotest.test_case "renders" `Quick test_return_support ] );
      ( "donate",
        [
          Alcotest.test_case "lists charities" `Quick
            test_donate_lists_charities;
          Alcotest.test_case "focus filter" `Quick test_donate_focus_filter;
          Alcotest.test_case "known slug" `Quick test_donate_known_slug;
          Alcotest.test_case "unknown slug" `Quick test_donate_unknown_slug;
        ] );
      ( "dispatch",
        [
          Alcotest.test_case "unknown command" `Quick test_unknown_command;
        ] );
    ]
