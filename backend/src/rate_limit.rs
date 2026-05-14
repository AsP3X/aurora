use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Fixed-window-ish limiter: at most `max_per_window` hits per `window` per key.
pub struct PerKeyRateLimiter {
    inner: Mutex<HashMap<String, Vec<Instant>>>,
    max_per_window: usize,
    window: Duration,
}

impl PerKeyRateLimiter {
    pub fn new(max_per_window: usize, window: Duration) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            max_per_window: max_per_window.max(1),
            window: window.max(Duration::from_secs(1)),
        }
    }

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
