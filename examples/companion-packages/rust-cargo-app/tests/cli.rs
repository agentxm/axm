//! Integration tests for the PawMatch CLI. Each test drives [`Cli`] with
//! buffered writers and a stub URL opener so no I/O escapes the test process.

use std::cell::RefCell;
use std::rc::Rc;

use pawmatch::charities::CHARITIES_DISCLAIMER;
use pawmatch::Cli;
use tinyflags::Context;

fn run(args: &[&str]) -> (i32, String, String) {
    let mut out: Vec<u8> = Vec::new();
    let mut err: Vec<u8> = Vec::new();
    let code = {
        let mut cli = Cli::new(&mut out, &mut err).with_context(Context::new("test-session"));
        cli.open_url = Box::new(|_url: &str| Ok(()));
        let owned: Vec<String> = args.iter().map(|s| (*s).to_owned()).collect();
        cli.run(&owned)
    };
    (
        code,
        String::from_utf8(out).expect("stdout utf8"),
        String::from_utf8(err).expect("stderr utf8"),
    )
}

#[test]
fn fees_exits_zero() {
    let (code, out, _err) = run(&["fees"]);
    assert_eq!(code, 0);
    assert!(out.contains("Adoption fees"), "out: {out}");
}

#[test]
fn return_support_exits_zero() {
    let (code, out, _err) = run(&["return-support"]);
    assert_eq!(code, 0);
    assert!(out.contains("Return support"), "out: {out}");
}

#[test]
fn browse_lists_pets() {
    let (code, out, _err) = run(&["browse"]);
    assert_eq!(code, 0);
    for name in ["Biscuit", "Pepper", "Marigold"] {
        assert!(out.contains(name), "browse missing {name:?} in: {out}");
    }
}

#[test]
fn browse_filters_by_species() {
    let (code, out, _err) = run(&["browse", "--species", "cat"]);
    assert_eq!(code, 0);
    assert!(out.contains("Pepper"), "cat browse missing Pepper: {out}");
    assert!(
        !out.contains("Biscuit"),
        "cat browse must not list Biscuit: {out}",
    );
}

#[test]
fn show_known_pet() {
    let (code, out, _err) = run(&["show", "biscuit"]);
    assert_eq!(code, 0);
    assert!(out.contains("Biscuit"), "show out: {out}");
}

#[test]
fn show_unknown_pet_exits_one() {
    let (code, _out, err) = run(&["show", "no-such-pet"]);
    assert_eq!(code, 1);
    assert!(err.contains("Unknown pet"), "err: {err}");
}

#[test]
fn match_with_no_prefs_hints_at_flags() {
    let (code, out, _err) = run(&["match"]);
    assert_eq!(code, 0);
    assert!(out.contains("Strategy:"), "match out: {out}");
    assert!(
        out.contains("(no preference flags provided"),
        "match should hint: {out}",
    );
}

#[test]
fn match_with_prefs_does_not_hint() {
    let (code, out, _err) = run(&["match", "--has-kids", "--quiet-home"]);
    assert_eq!(code, 0);
    assert!(
        !out.contains("(no preference flags provided"),
        "match with prefs should not show hint: {out}",
    );
}

#[test]
fn apply_known_pet() {
    let (code, out, _err) = run(&["apply", "biscuit"]);
    assert_eq!(code, 0);
    assert!(
        out.contains("Adoption application for Biscuit"),
        "apply out: {out}",
    );
}

#[test]
fn apply_unknown_pet_exits_one() {
    let (code, _out, err) = run(&["apply", "no-such-pet"]);
    assert_eq!(code, 1);
    assert!(err.contains("Unknown pet"), "err: {err}");
}

#[test]
fn donate_list() {
    let (code, out, _err) = run(&["donate"]);
    assert_eq!(code, 0);
    assert!(out.contains("Animal-welfare charities"), "donate out: {out}");
    assert!(
        out.contains(CHARITIES_DISCLAIMER),
        "donate must include disclaimer: {out}",
    );
}

#[test]
fn donate_filters_by_focus() {
    let (code, out, _err) = run(&["donate", "--focus", "rescue"]);
    assert_eq!(code, 0);
    assert!(out.contains("Brother Wolf"), "rescue should include Brother Wolf: {out}");
    assert!(!out.contains("ASPCA"), "rescue must not include ASPCA: {out}");
}

#[test]
fn donate_open_invokes_opener() {
    let opened: Rc<RefCell<Option<String>>> = Rc::new(RefCell::new(None));
    let opened_clone = Rc::clone(&opened);

    let mut out: Vec<u8> = Vec::new();
    let mut err: Vec<u8> = Vec::new();
    let code = {
        let mut cli = Cli::new(&mut out, &mut err).with_context(Context::new("test-session"));
        cli.open_url = Box::new(move |url: &str| {
            *opened_clone.borrow_mut() = Some(url.to_owned());
            Ok(())
        });
        let args: Vec<String> = ["donate", "brother-wolf", "--open"]
            .into_iter()
            .map(|s| s.to_owned())
            .collect();
        cli.run(&args)
    };
    assert_eq!(code, 0);
    assert!(opened.borrow().is_some(), "OpenUrl was not invoked");
}

#[test]
fn donate_unknown_charity_exits_one() {
    let (code, _out, err) = run(&["donate", "no-such-charity"]);
    assert_eq!(code, 1);
    assert!(err.contains("Unknown charity"), "err: {err}");
}

#[test]
fn unknown_command_exits_two() {
    let (code, _out, err) = run(&["nonsense"]);
    assert_eq!(code, 2);
    assert!(err.contains("unknown command"), "err: {err}");
}

#[test]
fn no_args_exits_one() {
    let (code, _out, _err) = run(&[]);
    assert_eq!(code, 1);
}

#[test]
fn help_exits_zero() {
    let (code, out, _err) = run(&["--help"]);
    assert_eq!(code, 0);
    assert!(
        out.contains("pawmatch — community pet adoption CLI."),
        "help out: {out}",
    );
}
