// Human: In-memory per-key hit counter with a sliding window of recent timestamps—used for coarse admin burst protection.
// Agent: MUTEX HashMap<String, Vec<Instant>>; check RETAINS recent hits; RETURNS Ok/Err; REQUIRES max_per_window and window Duration.
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::http::HeaderMap;

use crate::error::AppError;

/// Fixed-window-ish limiter: at most `max_per_window` hits per `window` per key.
pub struct PerKeyRateLimiter {
    inner: Mutex<HashMap<String, Vec<Instant>>>,
    max_per_window: usize,
    window: Duration,
}

impl PerKeyRateLimiter {
    // Human: Clamp inputs so callers cannot accidentally configure a zero window or zero max that would break limiting semantics.
    // Agent: READS max_per_window, window; MUTATES none; REQUIRES at least 1 hit and ≥1s window after clamping.
    pub fn new(max_per_window: usize, window: Duration) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            max_per_window: max_per_window.max(1),
            window: window.max(Duration::from_secs(1)),
        }
    }

    // Human: Drop timestamps older than the window, then reject if the bucket is already at capacity for this key.
    // Agent: MUTATES inner map entry; READS now Instant; RETURNS Err on limit; PUSHES now on success.
    pub fn check(&self, key: &str) -> Result<(), ()> {
        let now = Instant::now();
        let mut guard = self.inner.lock().unwrap();
        let v = guard.entry(key.to_string()).or_default();
        v.retain(|t| now.duration_since(*t) < self.window);
        if v.len() >= self.max_per_window {
            return Err(());
        }
        v.push(now);
        Ok(())
    }
}

// Human: Map a failed limiter check into the canonical API 429 envelope.
// Agent: CALLS PerKeyRateLimiter::check; RETURNS AppError::RateLimited on Err.
pub fn enforce(limiter: &PerKeyRateLimiter, key: &str) -> Result<(), AppError> {
    limiter.check(key).map_err(|_| AppError::RateLimited)
}

// Human: Prefer reverse-proxy forwarded headers, then fall back when the app is reached directly.
// Agent: READS X-Forwarded-For, X-Real-IP; RETURNS first IP or "unknown"; USED for auth rate-limit keys.
pub fn client_ip_from_headers(headers: &HeaderMap) -> String {
    if let Some(value) = headers.get("x-forwarded-for") {
        if let Ok(text) = value.to_str() {
            if let Some(first) = text.split(',').map(str::trim).find(|s| !s.is_empty()) {
                return first.to_string();
            }
        }
    }
    if let Some(value) = headers.get("x-real-ip") {
        if let Ok(text) = value.to_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    "unknown".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enforce_returns_rate_limited_when_bucket_full() {
        let rl = PerKeyRateLimiter::new(2, Duration::from_secs(60));
        assert!(enforce(&rl, "k").is_ok());
        assert!(enforce(&rl, "k").is_ok());
        assert!(matches!(enforce(&rl, "k"), Err(AppError::RateLimited)));
    }

    #[test]
    fn client_ip_prefers_forwarded_for_first_hop() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            "203.0.113.1, 10.0.0.1".parse().unwrap(),
        );
        assert_eq!(client_ip_from_headers(&headers), "203.0.113.1");
    }

    #[test]
    fn client_ip_falls_back_to_real_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", "198.51.100.2".parse().unwrap());
        assert_eq!(client_ip_from_headers(&headers), "198.51.100.2");
    }
}
