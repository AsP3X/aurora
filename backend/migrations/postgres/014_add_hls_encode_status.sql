ALTER TABLE songs ADD COLUMN IF NOT EXISTS hls_encode_status TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS hls_encode_error TEXT;

UPDATE songs SET hls_encode_status = 'ready' WHERE hls_ready IS TRUE;
UPDATE songs SET hls_encode_status = 'pending' WHERE hls_ready IS NOT TRUE;
