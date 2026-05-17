-- Human: Track HLS transcode lifecycle so admins see failures instead of a silent hls_ready=false.
-- Agent: ADDS hls_encode_status + hls_encode_error on songs; backfills ready rows from hls_ready.
ALTER TABLE songs ADD COLUMN hls_encode_status TEXT;
ALTER TABLE songs ADD COLUMN hls_encode_error TEXT;

UPDATE songs SET hls_encode_status = 'ready' WHERE hls_ready = 1;
UPDATE songs SET hls_encode_status = 'pending' WHERE hls_ready = 0 OR hls_ready IS NULL;
