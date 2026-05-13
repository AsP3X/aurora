use sqlx::AnyPool;

pub struct Dialect {
    pub hour_extract: &'static str,
    pub dow_extract: &'static str,
    pub date_eq_today: &'static str,
    pub date_gte_week_ago: &'static str,
    pub date_gte_month_start: &'static str,
}

pub async fn get(pool: &AnyPool) -> Dialect {
    let is_sqlite: Option<(String,)> = sqlx::query_as("SELECT sqlite_version()")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();

    if is_sqlite.is_some() {
        Dialect {
            hour_extract: "CAST(strftime('%H', started_at) AS INTEGER)",
            dow_extract: "CAST(strftime('%w', started_at) AS INTEGER)",
            date_eq_today: "date(started_at) = date('now')",
            date_gte_week_ago: "date(started_at) >= date('now', '-7 days')",
            date_gte_month_start: "date(started_at) >= date('now', 'start of month')",
        }
    } else {
        Dialect {
            hour_extract: "EXTRACT(hour FROM started_at::timestamp)::int",
            dow_extract: "EXTRACT(dow FROM started_at::timestamp)::int",
            date_eq_today: "started_at::date = CURRENT_DATE",
            date_gte_week_ago: "started_at::date >= CURRENT_DATE - INTERVAL '7 days'",
            date_gte_month_start: "started_at::date >= DATE_TRUNC('month', CURRENT_DATE)",
        }
    }
}
