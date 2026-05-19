// Human: Short TTL cache for `users.enabled` lookups in auth middleware to cut DB load during HLS segment storms.
// Agent: READS user_id; WRITES bool+Instant; TTL 30s; MUTEX-backed HashMap on AppState.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

const CACHE_TTL: Duration = Duration::from_secs(30);

#[derive(Clone, Default)]
pub struct UserEnabledCache {
    inner: std::sync::Arc<Mutex<HashMap<String, (bool, Instant)>>>,
}

impl UserEnabledCache {
    // Human: Return cached enabled flag when fresh; None forces a DB read.
    // Agent: READS inner map; COMPARES Instant elapsed to CACHE_TTL.
    pub fn get(&self, user_id: &str) -> Option<bool> {
        let guard = self.inner.lock().ok()?;
        let (enabled, at) = guard.get(user_id)?;
        if at.elapsed() > CACHE_TTL {
            return None;
        }
        Some(*enabled)
    }

    // Human: Store the latest enabled value after a successful DB read.
    // Agent: WRITES HashMap entry; REPLACES prior value for user_id.
    pub fn set(&self, user_id: &str, enabled: bool) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.insert(user_id.to_string(), (enabled, Instant::now()));
        }
    }

    // Human: Drop cached state when an admin toggles account activation.
    // Agent: REMOVES user_id key; CALL from admin enabled handler.
    pub fn invalidate(&self, user_id: &str) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.remove(user_id);
        }
    }
}
