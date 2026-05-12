#!/bin/sh
set -e

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

# Initialize a single .env file from its .env.example if missing, then replace secrets
init_env_file() {
    env_file="$1"
    example_file="$2"

    if [ ! -f "$example_file" ]; then
        echo "Error: $example_file not found"
        exit 1
    fi

    if [ ! -f "$env_file" ]; then
        echo "Creating $env_file from $example_file..."
        cp "$example_file" "$env_file"
    fi

    tmp_file="${env_file}.tmp"
    cp "$env_file" "$tmp_file"

    while grep -q 'GENERATE_ME' "$tmp_file"; do
        secret="$(generate_secret)"
        perl -i -pe "BEGIN { \$replaced = 0 } if (!\$replaced && /GENERATE_ME/) { s/GENERATE_ME/$secret/; \$replaced = 1; }" "$tmp_file"
    done

    mv "$tmp_file" "$env_file"
    echo "$env_file is ready."
}

# Initialize root .env
init_env_file ".env" ".env.example"

# Initialize backend .env
init_env_file "backend/.env" "backend/.env.example"

# Initialize nebula-os .env
init_env_file "nebula-os/.env" "nebula-os/.env.example"
