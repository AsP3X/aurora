// Human: Shared caps for list/query endpoints so clients cannot request unbounded result sets.
// Agent: CONST MAX_LIST_LIMIT=200; clamp_i64 READS limit+offset; USED BY songs handlers.

/// Maximum rows returned from paginated library/admin list endpoints.
pub const MAX_LIST_LIMIT: i64 = 200;

/// Maximum offset accepted (guards pathological deep pagination).
pub const MAX_LIST_OFFSET: i64 = 100_000;

// Human: Clamp limit/offset into safe bounds before building SQL.
// Agent: PURE; RETURNS (limit, offset) with limit in 1..=MAX_LIST_LIMIT and offset capped.
pub fn clamp_pagination(limit: i64, offset: i64) -> (i64, i64) {
    let limit = limit.clamp(1, MAX_LIST_LIMIT);
    let offset = offset.clamp(0, MAX_LIST_OFFSET);
    (limit, offset)
}
