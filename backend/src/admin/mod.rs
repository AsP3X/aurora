// Human: Namespaces admin-only HTTP handlers (library CRUD helpers, settings, RBAC-adjacent user ops) and song upload staging.
// Agent: EXPORTS handlers + upload modules; NO runtime code here; ROUTER wires in lib.rs.
pub mod handlers;
pub mod upload;
