use std::path::PathBuf;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

pub trait Storage: Send + Sync + Clone + 'static {
    fn get_stream(
        &self,
        key: &str,
    ) -> impl std::future::Future<Output = anyhow::Result<(ReaderStream<File>, u64, String)>> + Send;

    #[allow(dead_code)]
    fn exists(
        &self, key: &str
    ) -> impl std::future::Future<Output = anyhow::Result<bool>> + Send;
}

#[derive(Clone, Debug)]
pub struct LocalStorage {
    pub base_dir: PathBuf,
}

impl Storage for LocalStorage {
    async fn get_stream(
        &self,
        key: &str,
    ) -> anyhow::Result<(ReaderStream<File>, u64, String)> {
        let path = self.base_dir.join(key);
        let file = File::open(&path).await?;
        let metadata = file.metadata().await?;
        let size = metadata.len();
        let stream = ReaderStream::new(file);
        let mime = mime_guess::from_path(&path)
            .first_or_octet_stream()
            .to_string();
        Ok((stream, size, mime))
    }

    async fn exists(&self, key: &str) -> anyhow::Result<bool> {
        let path = self.base_dir.join(key);
        Ok(path.exists())
    }
}
