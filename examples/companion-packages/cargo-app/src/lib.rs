//! PawMatch CLI internals. The companion AXM skills are designed to operate
//! on this crate; the `pawmatch` binary in `src/main.rs` is a thin wrapper
//! around [`Cli`].

pub mod charities;
pub mod cli;
pub mod flags;
pub mod match_engine;
pub mod pets;
pub mod variants;

pub use cli::Cli;
