// Human: Namespaces admin-only HTTP handlers (library CRUD, HLS retry, settings, RBAC) and song upload staging.
// Agent: EXPORTS handlers + hls_handlers + upload; ROUTER wires retry/search routes in lib.rs.
pub mod artwork_migration;
pub mod handlers;
pub mod hls_handlers;
pub mod upload;
