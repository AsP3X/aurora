use futures_util::StreamExt;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::storage::{Storage, StorageStream};

type HmacSha256 = Hmac<Sha256>;

fn generate_signature(method: &str, secret: &str, bucket: &str, key: &str, expires: u64) -> anyhow::Result<String> {
    let payload = format!("{}\n{}\n{}\n{}", method.to_uppercase(), bucket, key, expires);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())?;
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    Ok(hex::encode(result.into_bytes()))
}

#[derive(Clone, Debug)]
pub struct NebulaStorage {
    client: reqwest::Client,
    base_url: String,
    public_base_url: String,
    bucket: String,
    jwt_token: String,
    signing_secret: String,
}

impl NebulaStorage {
    pub fn new(base_url: String, public_base_url: String, bucket: String, jwt_secret: &str, signing_secret: &str) -> anyhow::Result<Self> {
        let token = generate_service_token(jwt_secret)?;
        let base_url = base_url.trim_end_matches('/').to_string();
        let public_base_url = public_base_url.trim_end_matches('/').to_string();
        tracing::info!(%base_url, %public_base_url, %bucket, "NebulaStorage client initialized");
        Ok(Self {
            client: reqwest::Client::new(),
            base_url,
            public_base_url,
            bucket,
            jwt_token: token,
            signing_secret: signing_secret.to_string(),
        })
    }

    fn url(&self, key: &str) -> String {
        format!("{}/{}/{}", self.base_url, self.bucket, key)
    }

    fn public_url(&self, key: &str) -> String {
        format!("{}/{}/{}", self.public_base_url, self.bucket, key)
    }

    fn auth_header(&self) -> reqwest::header::HeaderValue {
        reqwest::header::HeaderValue::from_str(&format!("Bearer {}", self.jwt_token))
            .unwrap_or_else(|_| reqwest::header::HeaderValue::from_static(""))
    }
}

fn generate_service_token(jwt_secret: &str) -> anyhow::Result<String> {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize)]
    struct Claims {
        sub: String,
        email: String,
        role: String,
        exp: i64,
        iat: i64,
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let exp = now + 86400 * 365; // 1 year

    let claims = Claims {
        sub: "aurora-backend".to_string(),
        email: "backend@aurora.local".to_string(),
        role: "admin".to_string(),
        exp,
        iat: now,
    };

    let header = Header::new(Algorithm::HS256);
    let token = encode(
        &header,
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )?;
    Ok(token)
}

#[async_trait::async_trait]
impl Storage for NebulaStorage {
    async fn get_stream(
        &self,
        key: &str,
    ) -> anyhow::Result<(StorageStream, u64, String)> {
        let url = self.url(key);
        tracing::info!(%url, key, "NebulaStorage GET request");
        let response = self
            .client
            .get(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            tracing::error!(%url, key, status = status.as_u16(), "NebulaStorage GET failed");
            anyhow::bail!("Nebula OS GET failed: {} {}", status.as_u16(), url);
        }

        let content_length = response
            .content_length()
            .unwrap_or(0);
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();

        tracing::info!(%url, key, content_length, %content_type, "NebulaStorage GET success");
        let stream = response.bytes_stream().map(|res| {
            res.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        });

        Ok((Box::pin(stream), content_length, content_type))
    }

    async fn exists(&self, key: &str) -> anyhow::Result<bool> {
        let url = self.url(key);
        tracing::debug!(%url, key, "NebulaStorage HEAD request");
        let response = self
            .client
            .head(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let exists = response.status().is_success();
        tracing::debug!(%url, key, exists, "NebulaStorage HEAD result");
        Ok(exists)
    }

    async fn delete(&self, key: &str) -> anyhow::Result<()> {
        let url = self.url(key);
        tracing::info!(%url, key, "NebulaStorage DELETE request");
        let response = self
            .client
            .delete(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() && status.as_u16() != 404 {
            tracing::error!(%url, key, status = status.as_u16(), "NebulaStorage DELETE failed");
            anyhow::bail!(
                "Nebula OS DELETE failed: {} {}",
                status.as_u16(),
                url
            );
        }
        tracing::info!(%url, key, "NebulaStorage DELETE success");
        Ok(())
    }

    async fn put(
        &self, key: &str, content_type: &str, data: Vec<u8>) -> anyhow::Result<()> {
        let url = self.url(key);
        let len = data.len();
        tracing::info!(%url, key, %content_type, len, "NebulaStorage PUT request");
        let response = self
            .client
            .put(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .header(reqwest::header::CONTENT_TYPE, content_type)
            .body(data)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            tracing::error!(%url, key, status = status.as_u16(), "NebulaStorage PUT failed");
            anyhow::bail!(
                "Nebula OS PUT failed: {} {}",
                status.as_u16(),
                url
            );
        }
        tracing::info!(%url, key, "NebulaStorage PUT success");
        Ok(())
    }

    fn presigned_url(&self, key: &str, expiry_seconds: u64) -> anyhow::Result<String> {
        let expires = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() + expiry_seconds;

        let signature = generate_signature("GET", &self.signing_secret, &self.bucket, key, expires)?;
        let url = format!(
            "{}?signature={}&expires={}",
            self.public_url(key), signature, expires
        );
        tracing::debug!(key, %url, expires, "NebulaStorage presigned_url generated");
        Ok(url)
    }

    fn presigned_segment_url(&self, key: &str, expires_secs: u64) -> anyhow::Result<String> {
        let expires = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() + expires_secs;

        let signature = generate_signature("GET", &self.signing_secret, &self.bucket, key, expires)?;
        let url = format!(
            "{}?signature={}&expires={}",
            self.public_url(key), signature, expires
        );
        tracing::debug!(key, %url, expires, "NebulaStorage presigned_segment_url generated");
        Ok(url)
    }
}
