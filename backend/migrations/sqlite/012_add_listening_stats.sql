ALTER TABLE playback_history ADD COLUMN ended_at TEXT;
ALTER TABLE playback_history ADD COLUMN updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

CREATE INDEX IF NOT EXISTS idx_history_user_started ON playback_history(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_history_started_at ON playback_history(started_at);
CREATE INDEX IF NOT EXISTS idx_history_user_ended ON playback_history(user_id, ended_at);
CREATE INDEX IF NOT EXISTS idx_history_duration ON playback_history(user_id, duration_listened_seconds) WHERE duration_listened_seconds > 0;
