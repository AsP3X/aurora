// Human: Persist per-song AES-128 media keys encrypted at rest with the server-wide master secret so ffmpeg and clients can fetch the same bytes later.
// Agent: WRITES song_encryption_keys rows; USES AES-256-GCM with master_secret; READS pool; rotate_key mutates existing row for a song UUID.
use anyhow::Context;
use rand::RngCore;
use sqlx::AnyPool;
use uuid::Uuid;

/// 16-byte AES-128 key
pub type AesKey = [u8; 16];

#[derive(Clone)]
pub struct KeyStore {
    pool: AnyPool,
    master_secret: [u8; 32],
}

impl KeyStore {
    // Human: Stretch configured master secret to 32 bytes (truncation/pad) deterministically so restarts decrypt existing rows.
    // Agent: READS master_secret string; COPIES into fixed [u8;32] prefix; STORES pool handle for INSERT/SELECT.
    pub fn new(pool: AnyPool, master_secret: String) -> Self {
        let mut secret = [0u8; 32];
        let bytes = master_secret.as_bytes();
        let len = bytes.len().min(32);
        secret[..len].copy_from_slice(&bytes[..len]);
        Self { pool, master_secret: secret }
    }

    // Human: Randomly generate a fresh AES-128 media key, encrypt it for storage, and insert a row tied to the new song UUID.
    // Agent: INSERT song_encryption_keys; RETURNS plaintext key for immediate ffmpeg use + key_id for DB linkage; USES transaction context via single statement.
    pub async fn create_key_for_song(&self, song_id: Uuid) -> anyhow::Result<(Uuid, AesKey)> {
        let mut key = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut key);
        let key_id = Uuid::new_v4();

        let encrypted = self.encrypt_key(&key)?;

        sqlx::query(
            "INSERT INTO song_encryption_keys (song_id, key_id, encrypted_key) VALUES ($1, $2, $3)"
        )
        .bind(song_id.to_string())
        .bind(key_id.to_string())
        .bind(&encrypted[..])
        .execute(&self.pool)
        .await
        .context("inserting song encryption key")?;

        Ok((key_id, key))
    }

    // Human: Fetch and decrypt the persisted key blob for playback when a client hits `/songs/:id/key`.
    // Agent: SELECT encrypted_key BY song_id; decrypt_key; RETURNS None if row missing; ERRORS if ciphertext corrupt.
    pub async fn get_key(&self, song_id: Uuid) -> anyhow::Result<Option<AesKey>> {
        let row: Option<(Vec<u8>,)> = sqlx::query_as(
            "SELECT encrypted_key FROM song_encryption_keys WHERE song_id = $1"
        )
        .bind(song_id.to_string())
        .fetch_optional(&self.pool)
        .await
        .context("fetching song encryption key")?;

        match row {
            Some((encrypted,)) => {
                let key = self.decrypt_key(&encrypted)?;
                Ok(Some(key))
            }
            None => Ok(None),
        }
    }

    // Human: Replace the stored media key ciphertext for a song—for now mostly a maintenance hook alongside re-transcode workflows.
    // Agent: UPDATE song_encryption_keys SET new random key_id + encrypted payload; REQUIRES existing song_id row; resets rotated_at per SQL.
    pub async fn rotate_key(&self, song_id: Uuid) -> anyhow::Result<()> {
        let key_id = Uuid::new_v4();
        let mut key = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut key);
        let encrypted = self.encrypt_key(&key)?;

        sqlx::query(
            "UPDATE song_encryption_keys SET key_id = $1, encrypted_key = $2, rotated_at = NULL, created_at = now() WHERE song_id = $3"
        )
        .bind(key_id.to_string())
        .bind(&encrypted[..])
        .bind(song_id.to_string())
        .execute(&self.pool)
        .await
        .context("rotating encryption key")?;

        Ok(())
    }

    // Human: Encrypt a 16-byte media key with AES-256-GCM using the server's master secret (currently static zero nonce—see TODO in code).
    // Agent: USES Aes256Gcm encrypt; READS master_secret; RETURNS ciphertext Vec<u8>; ERRORS bubble as anyhow strings.
    fn encrypt_key(&self, key: &AesKey) -> anyhow::Result<Vec<u8>> {
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };

        let cipher = Aes256Gcm::new_from_slice(&self.master_secret)
            .context("creating AES-256-GCM cipher")?;
        let nonce = Nonce::from_slice(&[0u8; 12]); // TODO: use random nonce and prepend
        let ciphertext = cipher.encrypt(nonce, key.as_ref())
            .map_err(|e| anyhow::anyhow!("encrypting AES key: {:?}", e))?;
        Ok(ciphertext)
    }

    // Human: Inverse of `encrypt_key`, yielding the original 16-byte media key for ffmpeg or HTTP key endpoints.
    // Agent: aes_gcm decrypt; COPIES into AesKey array; ERRORS if ciphertext/tag invalid.
    fn decrypt_key(&self, encrypted: &[u8]) -> anyhow::Result<AesKey> {
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };

        let cipher = Aes256Gcm::new_from_slice(&self.master_secret)
            .context("creating AES-256-GCM cipher")?;
        let nonce = Nonce::from_slice(&[0u8; 12]);
        let plaintext = cipher.decrypt(nonce, encrypted)
            .map_err(|e| anyhow::anyhow!("decrypting AES key: {:?}", e))?;

        let mut key = [0u8; 16];
        key.copy_from_slice(&plaintext);
        Ok(key)
    }
}
