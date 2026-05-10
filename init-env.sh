#!/bin/sh
set -e

ENV_FILE="${ENV_FILE:-.env}"
EXAMPLE_FILE="${EXAMPLE_FILE:-.env.example}"

if [ ! -f "$EXAMPLE_FILE" ]; then
    echo "Error: $EXAMPLE_FILE not found"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "Creating $ENV_FILE from $EXAMPLE_FILE..."
    cp "$EXAMPLE_FILE" "$ENV_FILE"
fi

# Generate random hex strings for any remaining GENERATE_ME placeholders
generate_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    elif command -v dd >/dev/null 2>&1; then
        dd if=/dev/urandom bs=1 count=32 2>/dev/null | od -An -tx1 | tr -d ' \n'
    else
        # Fallback using /dev/urandom with busybox tools
        head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
    fi
}

tmp_file="${ENV_FILE}.tmp"
cp "$ENV_FILE" "$tmp_file"

while grep -q 'GENERATE_ME' "$tmp_file"; do
    secret="$(generate_secret)"
    # Replace only the first occurrence each iteration
    sed -i "0,/GENERATE_ME/s/GENERATE_ME/${secret}/" "$tmp_file" 2>/dev/null || \
    sed "0,/GENERATE_ME/s/GENERATE_ME/${secret}/" "$tmp_file" > "${tmp_file}.new" && mv "${tmp_file}.new" "$tmp_file"
done

mv "$tmp_file" "$ENV_FILE"
echo "$ENV_FILE is ready."
