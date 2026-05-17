// Human: Wire Meilisearch-backed HTTP handlers for library search while keeping module surface minimal for the router.
// Agent: EXPORTS handlers submodule; USED by lib route nest under /search (see lib.rs).
pub mod handlers;
