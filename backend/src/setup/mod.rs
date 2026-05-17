// Human: First-run bootstrap API that creates the initial admin and seeds app_settings before normal auth routes are useful.
// Agent: EXPORTS handlers; ROUTER mounts unauthenticated setup_status/setup in lib.rs until users row non-empty.
pub mod handlers;
