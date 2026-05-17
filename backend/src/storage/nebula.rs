// Human: HTTP client for Aurora's Nebula object storage gateway—authenticated with service JWTs and HMAC query signing for browser fetches.
// Agent: USES reqwest with Bearer service token; IMPLEMENTS Storage; generate_signature BUILDS presigned GET URLs; READS base/public URLs + bucket.
use futures_util::StreamExt;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::storage::{Storage, StorageStream};

type HmacSha256 = Hmac<Sha256>;

// Human: Canonical string `${METHOD}\n${bucket}\n${key}\n${expires}` signed with the object-store signing secret for time-bounded URLs.
// Agent: READS method, secret, bucket, key, expires; RETURNS hex HMAC; USED by presigned_url + presigned_segment_url.
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
    // Human: Bootstrap HTTP client state and mint a long-lived backend JWT so subsequent object verbs share one Authorization header.
    // Agent: READS jwt_secret + signing_secret; CALLS generate_service_token; TRIMS base URLs; LOGS non-secret connection metadata only.
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

// Human: Mint a dedicated HS256 token identifying the backend service subject so Nebula accepts bucket operations without user cookies.
// Agent: READS jwt_secret; ENCODE Claims `{ sub: aurora-backend, role: admin }`; TTL ~1y; RETURNS compact JWT string.
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
    // Human: Stream the object bytes through reqwest into an async Reader-compatible byte stream with declared length and content-type.
    // Agent: HTTP GET with Bearer; REQUIRES 2xx; MAPS Body bytes_stream into io::Error adapter; LOGS URL/status metadata.
    async fn get_stream(
        &self,
        key: &str,
    ) -> anyhow::Result<(StorageStream, u64, String)> {
        let url = self.url(key);
        tracing::info!(url_redacted = %crate::redact::url_for_log(&url), key, "NebulaStorage GET request");
        let response = self
            .client
            .get(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            tracing::error!(url_redacted = %crate::redact::url_for_log(&url), key, status = status.as_u16(), "NebulaStorage GET failed");
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

        tracing::info!(url_redacted = %crate::redact::url_for_log(&url), key, content_length, %content_type, "NebulaStorage GET success");
        let stream = response.bytes_stream().map(|res| {
            res.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        });

        Ok((Box::pin(stream), content_length, content_type))
    }

    // Human: Cheap existence probe using HTTP HEAD so upload/commit paths can branch without downloading bodies.
    // Agent: HTTP HEAD with Bearer; RETURNS status.is_success; LOGS debug only.
    async fn exists(&self, key: &str) -> anyhow::Result<bool> {
        let url = self.url(key);
        tracing::debug!(url_redacted = %crate::redact::url_for_log(&url), key, "NebulaStorage HEAD request");
        let response = self
            .client
            .head(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let exists = response.status().is_success();
        tracing::debug!(url_redacted = %crate::redact::url_for_log(&url), key, exists, "NebulaStorage HEAD result");
        Ok(exists)
    }

    // Human: Remove an object key; treat 404 as success so deletes are idempotent during cleanup paths.
    // Agent: HTTP DELETE; ALLOWS 404; BAIL on other non-success; LOGS info/error with URL.
    async fn delete(&self, key: &str) -> anyhow::Result<()> {
        let url = self.url(key);
        tracing::info!(url_redacted = %crate::redact::url_for_log(&url), key, "NebulaStorage DELETE request");
        let response = self
            .client
            .delete(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() && status.as_u16() != 404 {
            tracing::error!(url_redacted = %crate::redact::url_for_log(&url), key, status = status.as_u16(), "NebulaStorage DELETE failed");
            anyhow::bail!(
                "Nebula OS DELETE failed: {} {}",
                status.as_u16(),
                url
            );
        }
        tracing::info!(url_redacted = %crate::redact::url_for_log(&url), key, "NebulaStorage DELETE success");
        Ok(())
    }

    // Human: Upload arbitrary bytes with explicit content type—used for audio, images, HLS segments, and playlists alike.
    // Agent: HTTP PUT body=data; REQUIRES 2xx; SETS CONTENT-TYPE; LOGS len + URL.
    async fn put(
        &self, key: &str, content_type: &str, data: Vec<u8>) -> anyhow::Result<()> {
        let url = self.url(key);
        let len = data.len();
        tracing::info!(url_redacted = %crate::redact::url_for_log(&url), key, %content_type, len, "NebulaStorage PUT request");
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
            tracing::error!(url_redacted = %crate::redact::url_for_log(&url), key, status = status.as_u16(), "NebulaStorage PUT failed");
            anyhow::bail!(
                "Nebula OS PUT failed: {} {}",
                status.as_u16(),
                url
            );
        }
        tracing::info!(url_redacted = %crate::redact::url_for_log(&url), key, "NebulaStorage PUT success");
        Ok(())
    }

    // Human: Hand clients a time-limited CDN-style URL for full-file streaming when HLS is not ready or for simple proxies.
    // Agent: READS wall clock + expiry_seconds; APPENDS signature + expires query params on public_url; SAME scheme as segments.
    fn presigned_url(&self, key: &str, expiry_seconds: u64) -> anyhow::Result<String> {
        let expires = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() + expiry_seconds;

        let signature = generate_signature("GET", &self.signing_secret, &self.bucket, key, expires)?;
        let url = format!(
            "{}?signature={}&expires={}",
            self.public_url(key), signature, expires
        );
        tracing::debug!(key, url_redacted = %crate::redact::url_for_log(&url), expires, "NebulaStorage presigned_url generated");
        Ok(url)
    }

    // Human: Variant kept distinct for clarity at call sites even though signing matches `presigned_url` today—HLS segments use the same GET HMAC contract.
    // Agent: IDENTICAL signing inputs to presigned_url; RETURNS public_url + signature query; USED by handlers guessing nebula mode.
    fn presigned_segment_url(&self, key: &str, expires_secs: u64) -> anyhow::Result<String> {
        let expires = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() + expires_secs;

        let signature = generate_signature("GET", &self.signing_secret, &self.bucket, key, expires)?;
        let url = format!(
            "{}?signature={}&expires={}",
            self.public_url(key), signature, expires
        );
        tracing::debug!(key, url_redacted = %crate::redact::url_for_log(&url), expires, "NebulaStorage presigned_segment_url generated");
        Ok(url)
    }
}
