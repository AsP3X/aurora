use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Map};
use std::sync::Arc;

use crate::routes::AppState;

#[derive(Debug, Deserialize)]
pub struct ObjectParams {
    bucket: String,
    #[serde(rename = "*key")]
    key: String,
}

pub async fn put_object(
    State(state): State<Arc<AppState>>,
    Path(params): Path<ObjectParams>,
    req: Request,
) -> Response {
    let content_type = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut custom_meta_map = Map::new();
    for (k, v) in req.headers().iter() {
        let name = k.as_str();
        if let Some(key) = name.strip_prefix("x-nd-custom-meta-") {
            if let Ok(val) = v.to_str() {
                custom_meta_map.insert(key.to_string(), serde_json::Value::String(val.to_string()));
            }
        }
    }
    let custom_meta = if custom_meta_map.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&custom_meta_map).unwrap_or_default())
    };

    let body_stream = req.into_body().into_data_stream();
    let body_reader = tokio_util::io::StreamReader::new(
        body_stream.map(|result| {
            result.map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))
        }),
    );

    match state
        .storage
        .put_object(
            &params.bucket,
            &params.key,
            content_type.as_deref(),
            custom_meta.as_deref(),
            body_reader,
        )
        .await
    {
        Ok(meta) => {
            let mut resp = (StatusCode::CREATED, Json(json!({ "etag": meta.etag }))).into_response();
            if let Some(etag) = meta.etag {
                if let Ok(etag_header) = etag.parse() {
                    resp.headers_mut().insert(header::ETAG, etag_header);
                }
            }
            resp
        }
        Err(e) => {
            tracing::error!("put_object error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

pub async fn get_object(
    State(state): State<Arc<AppState>>,
    Path(params): Path<ObjectParams>,
    req: Request,
) -> Response {
    let range = req
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(parse_range);

    match state.storage.get_object(&params.bucket, &params.key, range).await {
        Ok((stream, content_length, mime_type)) => {
            let body = Body::from_stream(stream);
            let mut resp = Response::new(body);
            if let Ok(cl) = content_length.to_string().parse() {
                resp.headers_mut().insert(header::CONTENT_LENGTH, cl);
            }
            if let Some(mt) = mime_type {
                if let Ok(ct) = mt.parse() {
                    resp.headers_mut().insert(header::CONTENT_TYPE, ct);
                }
            }
            if range.is_some() {
                *resp.status_mut() = StatusCode::PARTIAL_CONTENT;
            }
            resp
        }
        Err(e) if e.to_string().contains("not found") => {
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "not found" })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("get_object error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

pub async fn head_object(
    State(state): State<Arc<AppState>>,
    Path(params): Path<ObjectParams>,
) -> Response {
    match state.storage.head_object(&params.bucket, &params.key).await {
        Ok(meta) => {
            let mut resp = Response::new(Body::empty());
            if let Ok(cl) = meta.size.to_string().parse() {
                resp.headers_mut().insert(header::CONTENT_LENGTH, cl);
            }
            if let Some(mt) = meta.mime_type {
                if let Ok(ct) = mt.parse() {
                    resp.headers_mut().insert(header::CONTENT_TYPE, ct);
                }
            }
            if let Some(etag) = meta.etag {
                if let Ok(etag_header) = etag.parse() {
                    resp.headers_mut().insert(header::ETAG, etag_header);
                }
            }
            resp
        }
        Err(e) if e.to_string().contains("not found") => {
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "not found" })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("head_object error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

pub async fn delete_object(
    State(state): State<Arc<AppState>>,
    Path(params): Path<ObjectParams>,
) -> Response {
    match state.storage.delete_object(&params.bucket, &params.key).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            tracing::error!("delete_object error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

fn parse_range(value: &str) -> Option<(u64, u64)> {
    let value = value.trim();
    if !value.starts_with("bytes=") {
        return None;
    }
    let range = &value[6..];
    let parts: Vec<&str> = range.split('-').collect();
    if parts.len() != 2 {
        return None;
    }
    let start = parts[0].parse().ok()?;
    let end = if parts[1].is_empty() {
        u64::MAX
    } else {
        parts[1].parse().ok()?
    };
    Some((start, end))
}
