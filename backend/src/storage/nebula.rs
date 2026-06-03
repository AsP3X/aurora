// Human: HTTP client for Nebular OS (https://github.com/AsP3X/nebular-os)—service JWTs, HMAC presigned URLs, copy, multipart, and metrics.
// Agent: USES reqwest with Bearer service token; IMPLEMENTS Storage; generate_signature BUILDS presigned GET URLs; READS base/public URLs + bucket.
use futures_util::StreamExt;
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, IF_NONE_MATCH};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use super::http_error::{ensure_success, StorageHttpError};
use super::{ObjectStorageMetrics, PutOptions, Storage, StorageStream, NEBULA_MULTIPART_THRESHOLD};

type HmacSha256 = Hmac<Sha256>;

// Human: Canonical string `${METHOD}\n${bucket}\n${key}\n${expires}` signed with the object-store signing secret for time-bounded URLs.
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
    metrics_token: Option<String>,
}

impl NebulaStorage {
    // Human: Bootstrap HTTP client state and mint a long-lived backend JWT so subsequent object verbs share one Authorization header.
    pub fn new(
        base_url: String,
        public_base_url: String,
        bucket: String,
        jwt_secret: &str,
        signing_secret: &str,
        metrics_token: Option<String>,
    ) -> anyhow::Result<Self> {
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
            metrics_token: metrics_token.filter(|t| !t.is_empty()),
        })
    }

    fn url(&self, key: &str) -> String {
        format!("{}/{}/{}", self.base_url, self.bucket, key)
    }

    fn public_url(&self, key: &str) -> String {
        format!("{}/{}/{}", self.public_base_url, self.bucket, key)
    }

    fn auth_header(&self) -> HeaderValue {
        HeaderValue::from_str(&format!("Bearer {}", self.jwt_token))
            .unwrap_or_else(|_| HeaderValue::from_static(""))
    }

    fn put_headers(&self, content_type: &str, options: PutOptions) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, self.auth_header());
        headers.insert(CONTENT_TYPE, HeaderValue::from_str(content_type).unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")));
        if options.create_only {
            headers.insert(IF_NONE_MATCH, HeaderValue::from_static("*"));
        }
        headers
    }

    async fn put_multipart(
        &self,
        key: &str,
        content_type: &str,
        data: Vec<u8>,
        options: PutOptions,
    ) -> anyhow::Result<()> {
        #[derive(serde::Deserialize)]
        struct InitResp {
            upload_id: String,
            part_size: usize,
        }

        let init_url = format!(
            "{}/{}/_multipart?key={}",
            self.base_url,
            self.bucket,
            urlencoding::encode(key)
        );
        let mut init_req = self
            .client
            .post(&init_url)
            .header(AUTHORIZATION, self.auth_header())
            .header(CONTENT_TYPE, content_type);
        if options.create_only {
            init_req = init_req.header(IF_NONE_MATCH, "*");
        }
        let init_resp = init_req.send().await?;
        let status = init_resp.status();
        if !status.is_success() {
            let body = init_resp.text().await.unwrap_or_default();
            return Err(StorageHttpError {
                status: status.as_u16(),
                body,
                context: "multipart init".into(),
            }
            .into());
        }
        let init: InitResp = init_resp.json().await?;
        let part_size = init.part_size.max(1);
        let upload_id = init.upload_id;

        let mut offset = 0usize;
        let mut part_number = 1i32;
        while offset < data.len() {
            let end = (offset + part_size).min(data.len());
            let chunk = &data[offset..end];
            let part_url = format!(
                "{}/{}/_multipart/{}/parts/{}",
                self.base_url, self.bucket, upload_id, part_number
            );
            let part_resp = self
                .client
                .put(&part_url)
                .header(AUTHORIZATION, self.auth_header())
                .body(chunk.to_vec())
                .send()
                .await?;
            ensure_success(part_resp, "multipart part").await?;
            offset = end;
            part_number += 1;
        }

        let complete_url = format!(
            "{}/{}/_multipart/{}/complete",
            self.base_url, self.bucket, upload_id
        );
        let complete_resp = self
            .client
            .post(&complete_url)
            .header(AUTHORIZATION, self.auth_header())
            .send()
            .await?;
        ensure_success(complete_resp, "multipart complete").await?;
        Ok(())
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
    let exp = now + 86400 * 365;

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
        tracing::info!(url_redacted = %crate::redact::url_for_log(&url), key, "NebulaStorage GET request");
        let response = self
            .client
            .get(&url)
            .header(AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            tracing::error!(url_redacted = %crate::redact::url_for_log(&url), key, status = status.as_u16(), "NebulaStorage GET failed");
            let body = response.text().await.unwrap_or_default();
            return Err(StorageHttpError {
                status: status.as_u16(),
                body,
                context: "GET".into(),
            }
            .into());
        }

        let content_length = response.content_length().unwrap_or(0);
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();

        let stream = response.bytes_stream().map(|res| {
            res.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
        });

        Ok((Box::pin(stream), content_length, content_type))
    }

    async fn exists(&self, key: &str) -> anyhow::Result<bool> {
        let url = self.url(key);
        let response = self
            .client
            .head(&url)
            .header(AUTHORIZATION, self.auth_header())
            .send()
            .await?;
        Ok(response.status().is_success())
    }

    async fn delete(&self, key: &str) -> anyhow::Result<()> {
        let url = self.url(key);
        let response = self
            .client
            .delete(&url)
            .header(AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let status = response.status();
        if status.is_success() || status.as_u16() == 404 {
            return Ok(());
        }
        let body = response.text().await.unwrap_or_default();
        Err(StorageHttpError {
            status: status.as_u16(),
            body,
            context: "DELETE".into(),
        }
        .into())
    }

    async fn put_with_options(
        &self,
        key: &str,
        content_type: &str,
        data: Vec<u8>,
        options: PutOptions,
    ) -> anyhow::Result<()> {
        if data.len() >= NEBULA_MULTIPART_THRESHOLD {
            return self.put_multipart(key, content_type, data, options).await;
        }

        let url = self.url(key);
        let len = data.len();
        tracing::info!(url_redacted = %crate::redact::url_for_log(&url), key, %content_type, len, "NebulaStorage PUT request");
        let response = self
            .client
            .put(&url)
            .headers(self.put_headers(content_type, options))
            .body(data)
            .send()
            .await?;
        ensure_success(response, "PUT").await
    }

    async fn copy_object(&self, src_key: &str, dest_key: &str) -> anyhow::Result<()> {
        let url = self.url(dest_key);
        let copy_source = format!("{}/{}", self.bucket, src_key);
        tracing::info!(
            src_key,
            dest_key,
            url_redacted = %crate::redact::url_for_log(&url),
            "NebulaStorage COPY request"
        );
        let response = self
            .client
            .put(&url)
            .header(AUTHORIZATION, self.auth_header())
            .header("x-nd-copy-source", copy_source)
            .send()
            .await?;
        ensure_success(response, "COPY").await
    }

    fn presigned_url(&self, key: &str, expiry_seconds: u64) -> anyhow::Result<String> {
        let expires = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs()
            + expiry_seconds;

        let signature = generate_signature("GET", &self.signing_secret, &self.bucket, key, expires)?;
        Ok(format!(
            "{}?signature={}&expires={}",
            self.public_url(key),
            signature,
            expires
        ))
    }

    fn presigned_segment_url(&self, key: &str, expires_secs: u64) -> anyhow::Result<String> {
        self.presigned_url(key, expires_secs)
    }

    async fn object_storage_metrics(&self) -> Option<ObjectStorageMetrics> {
        #[derive(serde::Deserialize)]
        struct MetricsResp {
            total_objects: i64,
            logical_bytes: i64,
            max_logical_bytes: i64,
            metadata_backend: String,
            replication_pending_events: u64,
        }

        let url = format!("{}/metrics", self.base_url);
        let mut req = self.client.get(&url);
        if let Some(token) = &self.metrics_token {
            req = req.header(AUTHORIZATION, format!("Bearer {}", token));
        }
        let resp = req.send().await.ok()?;
        if !resp.status().is_success() {
            tracing::warn!(
                status = resp.status().as_u16(),
                "NebulaStorage metrics fetch failed"
            );
            return None;
        }
        let m: MetricsResp = resp.json().await.ok()?;
        Some(ObjectStorageMetrics {
            total_objects: m.total_objects,
            logical_bytes: m.logical_bytes,
            max_logical_bytes: m.max_logical_bytes,
            metadata_backend: m.metadata_backend,
            replication_pending_events: m.replication_pending_events,
        })
    }
}
