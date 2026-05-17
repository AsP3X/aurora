// Human: In-memory per-key hit counter with a sliding window of recent timestamps—used for coarse admin burst protection.
// Agent: MUTEX HashMap<String, Vec<Instant>>; check RETAINS recent hits; RETURNS Ok/Err; REQUIRES max_per_window and window Duration.
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
