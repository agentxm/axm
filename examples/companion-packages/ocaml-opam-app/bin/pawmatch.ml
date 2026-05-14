(* pawmatch — community pet-adoption CLI.

   The implementation lives in the sibling [pawmatch] library so it can be
   tested in-process with alcotest. This binary only wires [argv] to
   [Pawmatch.Cli.run] and exits with its status. *)

let () =
  let argv = List.tl (Array.to_list Sys.argv) in
  exit (Pawmatch.Cli.run argv)
