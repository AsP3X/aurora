// Human: Trim emails before they appear in tracing so logs are safer to share off-host.
// Agent: READS raw email str; RETURNS redacted display string; USED by auth and admin upload logs only.
pub fn email_for_log(email: &str) -> String {
    let trimmed = email.trim();
    if let Some((local, domain)) = trimmed.split_once('@') {
        let first = local.chars().next().unwrap_or('?');
        format!("{first}***@{domain}")
    } else {
        "***".to_string()
    }
}
