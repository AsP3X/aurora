// Human: Shared rules for reading boolean flags stored as strings in `app_settings`.
// Agent: PURE value_is_true/value_is_false; TRIMS input; MATCHES true/1/yes/on and false/0/no/off case-insensitively.

/// Human: Treat common truthy spellings as enabled — admins may type `True` or `1` in the settings UI.
/// Agent: PURE; TRIMS; LOWERCASE compare; RETURNS bool.
pub fn value_is_true(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "true" | "1" | "yes" | "on"
    )
}

/// Human: Treat common falsy spellings as disabled for registration and feature flags.
/// Agent: PURE; TRIMS; LOWERCASE compare; RETURNS bool.
pub fn value_is_false(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "false" | "0" | "no" | "off"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truthy_values() {
        assert!(value_is_true("true"));
        assert!(value_is_true(" True "));
        assert!(value_is_true("1"));
        assert!(value_is_true("YES"));
    }

    #[test]
    fn falsy_values() {
        assert!(value_is_false("false"));
        assert!(value_is_false(" False "));
        assert!(value_is_false("0"));
    }
}
