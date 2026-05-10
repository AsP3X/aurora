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
    pub fn new(pool: AnyPool, master_secret: String) -> Self {
        let mut secret = [0u8; 32];
        let bytes = master_secret.as_bytes();
        let len = bytes.len().min(32);
        secret[..len].copy_from_slice(&bytes[..len]);
        Self { pool, master_secret: secret }
    }

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
