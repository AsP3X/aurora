// Human: Persist per-song AES-128 media keys encrypted at rest with the server-wide master secret so ffmpeg and clients can fetch the same bytes later.
// Agent: WRITES song_encryption_keys rows; USES AES-256-GCM with random 12-byte nonce prepended; READS pool; lazy-migrates legacy zero-nonce blobs on get_key.
use anyhow::Context;
use rand::RngCore;
use sqlx::AnyPool;
use uuid::Uuid;

/// 12-byte GCM nonce length (prepended to ciphertext in storage).
const NONCE_LEN: usize = 12;

/// AES-128 media key length in bytes.
const MEDIA_KEY_LEN: usize = 16;

/// GCM tag length appended to ciphertext by the `aes_gcm` crate.
const GCM_TAG_LEN: usize = 16;

/// Legacy rows stored only ciphertext+tag (32 bytes) with an all-zero nonce.
const LEGACY_ENCRYPTED_LEN: usize = MEDIA_KEY_LEN + GCM_TAG_LEN;

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
        Self {
            pool,
            master_secret: secret,
        }
    }

    // Human: Randomly generate a fresh AES-128 media key, encrypt it for storage, and insert a row tied to the new song UUID.
    // Agent: INSERT song_encryption_keys; RETURNS plaintext key for immediate ffmpeg use + key_id for DB linkage; USES transaction context via single statement.
    pub async fn create_key_for_song(&self, song_id: Uuid) -> anyhow::Result<(Uuid, AesKey)> {
        let mut key = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut key);
        let key_id = Uuid::new_v4();

        let encrypted = self.encrypt_key(&key)?;

        sqlx::query(
            "INSERT INTO song_encryption_keys (song_id, key_id, encrypted_key) VALUES ($1, $2, $3)",
        )
        .bind(song_id.to_string())
        .bind(key_id.to_string())
        .bind(&encrypted[..])
        .execute(&self.pool)
        .await
        .context("inserting song encryption key")?;

        Ok((key_id, key))
    }

    // Human: Fetch and decrypt the persisted key blob; legacy zero-nonce rows are re-encrypted on read when possible.
    // Agent: SELECT encrypted_key BY song_id; decrypt_key; OPTIONAL UPDATE on legacy; RETURNS None if row missing.
    pub async fn get_key(&self, song_id: Uuid) -> anyhow::Result<Option<AesKey>> {
        let row: Option<(Vec<u8>,)> = sqlx::query_as(
            "SELECT encrypted_key FROM song_encryption_keys WHERE song_id = $1",
        )
        .bind(song_id.to_string())
        .fetch_optional(&self.pool)
        .await
        .context("fetching song encryption key")?;

        match row {
            Some((encrypted,)) => {
                let legacy = is_legacy_encrypted_blob(&encrypted);
                let key = self.decrypt_key(&encrypted)?;
                if legacy {
                    self.migrate_legacy_blob(song_id, &key).await;
                }
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
            "UPDATE song_encryption_keys SET key_id = $1, encrypted_key = $2, rotated_at = NULL, created_at = now() WHERE song_id = $3",
        )
        .bind(key_id.to_string())
        .bind(&encrypted[..])
        .bind(song_id.to_string())
        .execute(&self.pool)
        .await
        .context("rotating encryption key")?;

        Ok(())
    }

    // Human: Best-effort rewrite of a legacy blob to nonce-prefixed format so future reads use random nonces.
    // Agent: CALLS encrypt_key; UPDATE song_encryption_keys; LOGS warn on failure; DOES NOT fail get_key.
    async fn migrate_legacy_blob(&self, song_id: Uuid, key: &AesKey) {
        match self.encrypt_key(key) {
            Ok(re_encrypted) => {
                if let Err(e) = sqlx::query(
                    "UPDATE song_encryption_keys SET encrypted_key = $1 WHERE song_id = $2",
                )
                .bind(&re_encrypted[..])
                .bind(song_id.to_string())
                .execute(&self.pool)
                .await
                {
                    tracing::warn!(
                        %song_id,
                        error = %e,
                        "failed to migrate legacy HLS encryption blob"
                    );
                }
            }
            Err(e) => {
                tracing::warn!(
                    %song_id,
                    error = %e,
                    "failed to re-encrypt legacy HLS key for migration"
                );
            }
        }
    }

    // Human: Encrypt with a random nonce and store as `nonce || ciphertext+tag` so identical keys do not produce identical blobs.
    // Agent: WRITES 12 random bytes + AES-256-GCM output; USES master_secret; MIN output len LEGACY_ENCRYPTED_LEN + NONCE_LEN.
    fn encrypt_key(&self, key: &AesKey) -> anyhow::Result<Vec<u8>> {
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };

        let cipher = Aes256Gcm::new_from_slice(&self.master_secret)
            .context("creating AES-256-GCM cipher")?;

        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, key.as_ref())
            .map_err(|e| anyhow::anyhow!("encrypting AES key: {:?}", e))?;

        let mut stored = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        stored.extend_from_slice(&nonce_bytes);
        stored.extend_from_slice(&ciphertext);
        Ok(stored)
    }

    // Human: Decrypt nonce-prefixed blobs; fall back to legacy all-zero nonce when blob length matches the old format.
    // Agent: READS first 12 bytes as nonce when len > LEGACY_ENCRYPTED_LEN; LEGACY path uses zero nonce; RETURNS 16-byte AesKey.
    fn decrypt_key(&self, encrypted: &[u8]) -> anyhow::Result<AesKey> {
        if is_legacy_encrypted_blob(encrypted) {
            return self.decrypt_with_nonce(encrypted, &[0u8; NONCE_LEN]);
        }
        if encrypted.len() <= NONCE_LEN {
            anyhow::bail!(
                "encrypted key blob too short ({} bytes)",
                encrypted.len()
            );
        }
        let (nonce_bytes, ciphertext) = encrypted.split_at(NONCE_LEN);
        self.decrypt_with_nonce(ciphertext, nonce_bytes)
    }

    // Human: Shared AES-256-GCM decrypt for both legacy and current on-disk layouts.
    // Agent: CALLS aes_gcm decrypt; VALIDATES plaintext length == MEDIA_KEY_LEN; COPIES into AesKey.
    fn decrypt_with_nonce(
        &self,
        ciphertext: &[u8],
        nonce_bytes: &[u8],
    ) -> anyhow::Result<AesKey> {
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };

        if nonce_bytes.len() != NONCE_LEN {
            anyhow::bail!("invalid GCM nonce length {}", nonce_bytes.len());
        }

        let cipher = Aes256Gcm::new_from_slice(&self.master_secret)
            .context("creating AES-256-GCM cipher")?;
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("decrypting AES key: {:?}", e))?;

        if plaintext.len() != MEDIA_KEY_LEN {
            anyhow::bail!(
                "unexpected decrypted key length {} (want {})",
                plaintext.len(),
                MEDIA_KEY_LEN
            );
        }

        let mut key = [0u8; MEDIA_KEY_LEN];
        key.copy_from_slice(&plaintext);
        Ok(key)
    }
}

// Human: Legacy rows are exactly 32 bytes (16-byte key + 16-byte GCM tag) with no prepended nonce.
// Agent: PREDICATE len == LEGACY_ENCRYPTED_LEN; USED by decrypt_key and get_key migration.
fn is_legacy_encrypted_blob(encrypted: &[u8]) -> bool {
    encrypted.len() == LEGACY_ENCRYPTED_LEN
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_MASTER: &str = "test-master-secret-not-default-value!!";

    async fn test_store() -> KeyStore {
        sqlx::any::install_default_drivers();
        let pool = sqlx::AnyPool::connect("sqlite::memory:")
            .await
            .expect("in-memory any pool");
        KeyStore::new(pool, TEST_MASTER.to_string())
    }

    #[tokio::test]
    async fn encrypt_produces_nonce_prefix_and_unique_ciphertexts() {
        let store = test_store().await;
        let key = [0xAB; 16];
        let a = store.encrypt_key(&key).expect("encrypt a");
        let b = store.encrypt_key(&key).expect("encrypt b");

        assert!(a.len() > LEGACY_ENCRYPTED_LEN);
        assert!(b.len() > LEGACY_ENCRYPTED_LEN);
        assert_ne!(a, b, "random nonce should diversify ciphertext");
        assert_ne!(&a[..NONCE_LEN], &[0u8; NONCE_LEN], "nonce should not be all zeros");
    }

    #[tokio::test]
    async fn roundtrip_nonce_prefixed_blob() {
        let store = test_store().await;
        let key = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        let encrypted = store.encrypt_key(&key).expect("encrypt");
        let decrypted = store.decrypt_key(&encrypted).expect("decrypt");
        assert_eq!(decrypted, key);
    }

    #[tokio::test]
    async fn decrypts_legacy_zero_nonce_blob() {
        let store = test_store().await;
        use aes_gcm::{
            aead::{Aead, KeyInit},
            Aes256Gcm, Nonce,
        };

        let key = [0xCD; 16];
        let cipher =
            Aes256Gcm::new_from_slice(&store.master_secret).expect("cipher");
        let legacy_ct = cipher
            .encrypt(Nonce::from_slice(&[0u8; NONCE_LEN]), key.as_ref())
            .expect("legacy encrypt");
        assert_eq!(legacy_ct.len(), LEGACY_ENCRYPTED_LEN);

        let decrypted = store.decrypt_key(&legacy_ct).expect("legacy decrypt");
        assert_eq!(decrypted, key);
    }

    #[test]
    fn legacy_detection_matches_length_only() {
        assert!(is_legacy_encrypted_blob(&[0u8; LEGACY_ENCRYPTED_LEN]));
        assert!(!is_legacy_encrypted_blob(&[0u8; LEGACY_ENCRYPTED_LEN + 1]));
    }
}
