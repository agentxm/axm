//! `pawmatch` is the example reference consumer of the
//! `agentxm-example-tinyflags` crate. It is not publishable and exists only
//! to demonstrate consumption.

use std::env;
use std::io;
use std::process;

use pawmatch::Cli;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let mut stdout = io::stdout().lock();
    let mut stderr = io::stderr().lock();
    let mut cli = Cli::new(&mut stdout, &mut stderr);
    let code = cli.run(&args);
    process::exit(code);
}
