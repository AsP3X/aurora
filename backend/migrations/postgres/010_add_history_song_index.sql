CREATE INDEX idx_history_user_song ON playback_history(user_id, song_id);
CREATE INDEX idx_history_completed ON playback_history(user_id, song_id, completed);
