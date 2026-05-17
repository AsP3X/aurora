// Human: Abstract object storage access (stream GET, existence checks, PUT/DELETE, and presigned URL helpers) with a filesystem-backed dev implementation.
// Agent: DEFINES Storage trait + LocalStorage; TYPE StorageStream pinned byte stream; nebula module adds HTTP gateway backend; CALLERS in admin upload + song streaming.
use std::path::PathBuf;
use bytes::Bytes;
use futures_util::Stream;
use std::pin::Pin;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

pub mod nebula;

pub type StorageStream = Pin<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>>;

// Human: All concrete backends must be Send + `'static` so they can live inside `Arc<dyn Storage>` on AppState across async handlers.
// Agent: async_trait methods get_stream/exists/delete/put + presigned_url + presigned_segment_url; IMPLEMENTORS LocalStorage + NebulaStorage.
#[async_trait::async_trait]
pub trait Storage: Send + Sync + 'static {
    async fn get_stream(
        &self,
        key: &str,
    ) -> anyhow::Result<(StorageStream, u64, String)>;

    async fn exists(&self, key: &str) -> anyhow::Result<bool>;

    async fn delete(&self, key: &str) -> anyhow::Result<()>;

    async fn put(&self, key: &str, content_type: &str, data: Vec<u8>) -> anyhow::Result<()>;

    fn presigned_url(&self, key: &str, expiry_seconds: u64) -> anyhow::Result<String>;

    fn presigned_segment_url(&self, key: &str, expires_secs: u64) -> anyhow::Result<String>;
}

#[derive(Clone, Debug)]
pub struct LocalStorage {
    pub base_dir: PathBuf,
}

// Human: Map logical storage keys to `<base_dir>/<key>` files, creating parent folders on write—good for single-node dev.
// Agent: READS/WRITES tokio::fs under base_dir; presigned_* bail unsupported; MIME from mime_guess on get_stream.
#[async_trait::async_trait]
impl Storage for LocalStorage {
    async fn get_stream(
        &self,
        key: &str,
    ) -> anyhow::Result<(StorageStream, u64, String)> {
        let path = self.base_dir.join(key);
        let file = File::open(&path).await?;
        let metadata = file.metadata().await?;
        let size = metadata.len();
        let stream = ReaderStream::new(file);
        let mime = mime_guess::from_path(&path)
            .first_or_octet_stream()
            .to_string();
        Ok((Box::pin(stream), size, mime))
    }

    async fn exists(&self, key: &str) -> anyhow::Result<bool> {
        let path = self.base_dir.join(key);
        Ok(path.exists())
    }

    async fn delete(&self, key: &str) -> anyhow::Result<()> {
        let path = self.base_dir.join(key);
        if path.exists() {
            tokio::fs::remove_file(&path).await?;
        }
        Ok(())
    }

    async fn put(&self, key: &str, _content_type: &str, data: Vec<u8>) -> anyhow::Result<()> {
        let path = self.base_dir.join(key);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&path, data).await?;
        Ok(())
    }

    fn presigned_url(&self, _key: &str, _expiry_seconds: u64) -> anyhow::Result<String> {
        anyhow::bail!("presigned URLs are not supported in local storage mode")
    }

    fn presigned_segment_url(&self, _key: &str, _expires_secs: u64) -> anyhow::Result<String> {
        anyhow::bail!("LocalStorage does not support presigned URLs; serve segments through the proxy endpoint")
    }
}
