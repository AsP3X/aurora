// Human: Central helpers so tracing and HTTP spans never emit raw emails, tickets, signatures, or host-specific paths.
// Agent: PURE string transforms; NO I/O; USED by auth/upload/storage/lib TraceLayer; UNIT TESTS in mod tests.

/// Redact an email local-part while keeping the domain for support correlation.
// Human: Trim emails before they appear in tracing so logs are safer to share off-host.
// Agent: READS raw email str; RETURNS redacted display string; USED by auth and admin upload logs.
pub fn email_for_log(email: &str) -> String {
    let trimmed = email.trim();
    if let Some((local, domain)) = trimmed.split_once('@') {
        let first = local.chars().next().unwrap_or('?');
        format!("{first}***@{domain}")
    } else {
        "***".to_string()
    }
}

/// Mask the host-specific portion of an IP address (IPv4 last octet, IPv6 last group).
// Human: Keep coarse network context for abuse debugging without logging a full client identifier.
// Agent: READS IP str; RETURNS masked form; NO parse errors leak raw input beyond prefix trim.
pub fn ip_for_log(ip: &str) -> String {
    let trimmed = ip.trim();
    if trimmed.is_empty() {
        return "***".to_string();
    }
    if trimmed.contains(':') {
        if let Some((head, _tail)) = trimmed.rsplit_once(':') {
            if head.is_empty() {
                return "***".to_string();
            }
            return format!("{head}:xxx");
        }
        return "***".to_string();
    }
    let mut parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() == 4 {
        parts[3] = "xxx";
        return parts.join(".");
    }
    "***".to_string()
}

/// Redact HMAC tail of a stream/artwork ticket (`song.user.expiry.sig`).
// Human: Invalid stream tickets may still be logged at debug level without leaking the signing proof.
// Agent: READS dot-separated ticket; RETURNS first three fields + literal sig redaction; INVALID => [invalid-ticket].
pub fn stream_ticket_for_log(ticket: &str) -> String {
    let trimmed = ticket.trim();
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() == 4 {
        format!("{}.{}.{}.[sig-redacted]", parts[0], parts[1], parts[2])
    } else if parts.len() >= 2 {
        format!("{}.[sig-redacted]", parts[0])
    } else if trimmed.is_empty() {
        "[empty-ticket]".to_string()
    } else {
        "[invalid-ticket]".to_string()
    }
}

/// Redact a bearer/JWT compact token to a short prefix only.
// Human: Auth middleware debug lines must never print full JWT material.
// Agent: READS bearer token; RETURNS header segment prefix or [redacted]; NO decode.
pub fn bearer_token_for_log(token: &str) -> String {
    let trimmed = token.trim();
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() == 3 {
        let prefix: String = parts[0].chars().take(8).collect();
        format!("{prefix}...[jwt-redacted]")
    } else if trimmed.is_empty() {
        "[empty-token]".to_string()
    } else {
        "[redacted]".to_string()
    }
}

/// Log only the extension for user-supplied upload filenames (stems may contain PII).
// Human: Multipart filenames can embed real names; logs should not replay them verbatim.
// Agent: READS filename str; RETURNS [filename-redacted].ext or placeholder when extension missing.
pub fn filename_for_log(filename: &str) -> String {
    let path = std::path::Path::new(filename);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| !e.is_empty());
    match ext {
        Some(ext) => format!("[filename-redacted].{ext}"),
        None => "[filename-redacted]".to_string(),
    }
}

/// Collapse absolute filesystem paths to a short suffix (keep known object-key prefixes intact).
// Human: Temp dirs and home paths must not land in upload/HLS error logs.
// Agent: READS path str; RETURNS storage key unchanged when safe; ELSE .../last/two/segments.
pub fn path_for_log(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return "[empty-path]".to_string();
    }
    if is_safe_storage_key(trimmed) {
        return trimmed.to_string();
    }
    let segments: Vec<&str> = trimmed.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() <= 2 {
        return trimmed.to_string();
    }
    format!(".../{}", segments[segments.len() - 2..].join("/"))
}

fn is_safe_storage_key(path: &str) -> bool {
    path.starts_with("songs/")
        || path.starts_with("staging/")
        || path.starts_with("uploads/")
        || path.starts_with("artwork/")
}

/// Strip sensitive query parameters from a URL string (tickets, signatures, tokens).
// Human: Presigned Nebula URLs and stream links carry secrets in the query string.
// Agent: READS url str; RETURNS base + redacted query; CALLS stream_ticket_for_log for ticket= values.
pub fn url_for_log(url: &str) -> String {
    let trimmed = url.trim();
    let Some((base, query)) = trimmed.split_once('?') else {
        return trimmed.to_string();
    };
    let redacted = redact_query_string(query);
    if redacted.is_empty() {
        base.to_string()
    } else {
        format!("{base}?{redacted}")
    }
}

/// Redact sensitive query parameters on an HTTP URI (for tower-http request spans).
// Human: Default TraceLayer logs full URIs; stream and presigned routes need scrubbed query strings.
// Agent: READS http::Uri; RETURNS path + redacted query; CALLS redact_query_string.
pub fn uri_for_log(uri: &axum::http::Uri) -> String {
    let path = uri.path();
    match uri.query() {
        Some(query) => {
            let redacted = redact_query_string(query);
            if redacted.is_empty() {
                path.to_string()
            } else {
                format!("{path}?{redacted}")
            }
        }
        None => path.to_string(),
    }
}

fn redact_query_string(query: &str) -> String {
    query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            let key_lower = key.to_ascii_lowercase();
            let redacted_value = match key_lower.as_str() {
                "ticket" => stream_ticket_for_log(value),
                "signature" | "sig" | "token" | "access_token" | "jwt" => "[redacted]".to_string(),
                "expires" | "exp" => value.to_string(),
                _ if key_lower.contains("secret") || key_lower.contains("password") => {
                    "[redacted]".to_string()
                }
                _ => value.to_string(),
            };
            format!("{key}={redacted_value}")
        })
        .collect::<Vec<_>>()
        .join("&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_redacts_local_part() {
        assert_eq!(email_for_log("alice@example.com"), "a***@example.com");
    }

    #[test]
    fn ip_masks_ipv4_last_octet() {
        assert_eq!(ip_for_log("203.0.113.42"), "203.0.113.xxx");
    }

    #[test]
    fn ip_masks_ipv6_tail() {
        assert_eq!(ip_for_log("2001:db8::1"), "2001:db8::xxx");
    }

    #[test]
    fn stream_ticket_hides_hmac() {
        let ticket = "song-uuid.user-uuid.1700000000.deadbeefcafe";
        assert_eq!(
            stream_ticket_for_log(ticket),
            "song-uuid.user-uuid.1700000000.[sig-redacted]"
        );
    }

    #[test]
    fn filename_keeps_extension_only() {
        assert_eq!(
            filename_for_log(r"C:\Music\My Private Song.flac"),
            "[filename-redacted].flac"
        );
    }

    #[test]
    fn path_collapses_home_prefix() {
        assert_eq!(
            path_for_log(r"C:\Users\alice\AppData\Local\Temp\aurora_stage_x\audio.mp3"),
            ".../aurora_stage_x/audio.mp3"
        );
    }

    #[test]
    fn path_keeps_storage_keys() {
        assert_eq!(
            path_for_log("staging/abc-123/audio.flac"),
            "staging/abc-123/audio.flac"
        );
    }

    #[test]
    fn url_redacts_signature_and_ticket() {
        let url = "https://cdn.example/bucket/key?signature=abc123&expires=99&ticket=song.user.1.sig";
        let out = url_for_log(url);
        assert!(out.contains("signature=[redacted]"));
        assert!(out.contains("expires=99"));
        assert!(out.contains("[sig-redacted]"));
        assert!(!out.contains("abc123"));
        assert!(!out.contains(".sig"));
    }

    #[test]
    fn uri_for_log_redacts_ticket_query() {
        let uri: axum::http::Uri = "/api/v1/songs/abc/stream?ticket=song.user.99.deadbeef"
            .parse()
            .unwrap();
        let out = uri_for_log(&uri);
        assert!(out.contains("[sig-redacted]"));
        assert!(!out.contains("deadbeef"));
    }
}
