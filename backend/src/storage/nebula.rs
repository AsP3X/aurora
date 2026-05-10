use futures_util::StreamExt;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::storage::{Storage, StorageStream};

#[derive(Clone, Debug)]
pub struct NebulaStorage {
    client: reqwest::Client,
    base_url: String,
    bucket: String,
    jwt_token: String,
}

impl NebulaStorage {
    pub fn new(base_url: String, bucket: String, jwt_secret: &str) -> anyhow::Result<Self> {
        let token = generate_service_token(jwt_secret)?;
        Ok(Self {
            client: reqwest::Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            bucket,
            jwt_token: token,
        })
    }

    fn url(&self, key: &str) -> String {
        format!("{}/{}/{}", self.base_url, self.bucket, key)
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
        let response = self
            .client
            .get(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
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
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        Ok(response.status().is_success())
    }

    async fn delete(&self, key: &str) -> anyhow::Result<()> {
        let url = self.url(key);
        let response = self
            .client
            .delete(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .send()
            .await?;

        if !response.status().is_success() && response.status().as_u16() != 404 {
            anyhow::bail!(
                "Nebula OS DELETE failed: {} {}",
                response.status().as_u16(),
                url
            );
        }
        Ok(())
    }

    async fn put(
        &self, key: &str, content_type: &str, data: Vec<u8>) -> anyhow::Result<()> {
        let url = self.url(key);
        let response = self
            .client
            .put(&url)
            .header(reqwest::header::AUTHORIZATION, self.auth_header())
            .header(reqwest::header::CONTENT_TYPE, content_type)
            .body(data)
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!(
                "Nebula OS PUT failed: {} {}",
                response.status().as_u16(),
                url
            );
        }
        Ok(())
    }
}
