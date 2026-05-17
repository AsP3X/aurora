// Human: Wire Meilisearch-backed HTTP handlers, indexing, and retry queue for search sync failures.
// Agent: EXPORTS handlers/indexer/sync_queue; USED by lib routes and admin song mutations.
pub mod handlers;
pub mod indexer;
pub mod sync_queue;
