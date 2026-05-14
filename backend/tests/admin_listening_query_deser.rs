//! Regression: admin listening-by-song query must deserialize from typical browser query strings.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AdminMultiListeningBySongParams {
    pub user_ids: String,
    #[serde(default = "default_period")]
    pub period: String,
    #[serde(default = "default_listening_by_song_limit")]
    pub limit: i64,
}

fn default_period() -> String {
    "all".to_string()
}

fn default_listening_by_song_limit() -> i64 {
    500
}

#[test]
fn deserialize_listening_by_song_query() {
    let qs = "user_ids=e857822e-1cc4-470c-bfdd-91eddde96ffd&period=all&limit=500";
    let p: AdminMultiListeningBySongParams = serde_urlencoded::from_str(qs).expect("query deser");
    assert_eq!(p.user_ids, "e857822e-1cc4-470c-bfdd-91eddde96ffd");
    assert_eq!(p.period, "all");
    assert_eq!(p.limit, 500);
}
