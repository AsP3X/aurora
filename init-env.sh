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

# Human: Older examples used a 17-char Meilisearch key; Aurora and Meilisearch require 32+.
# Agent: READS env_file; IF MEILI_MASTER_KEY is legacy/short THEN WRITE random hex from generate_secret.
upgrade_meili_master_key() {
    env_file="$1"
    if [ ! -f "$env_file" ]; then
        return 0
    fi
    if ! grep -q '^MEILI_MASTER_KEY=' "$env_file"; then
        return 0
    fi
    current="$(grep '^MEILI_MASTER_KEY=' "$env_file" | head -n 1 | cut -d= -f2- | tr -d '\r')"
    case "$current" in
        aurora-master-key|GENERATE_ME)
            secret="$(generate_secret)"
            tmp_file="${env_file}.meili.tmp"
            awk -v secret="$secret" '
                BEGIN { done = 0 }
                /^MEILI_MASTER_KEY=/ && !done { print "MEILI_MASTER_KEY=" secret; done = 1; next }
                { print }
            ' "$env_file" > "$tmp_file"
            mv "$tmp_file" "$env_file"
            echo "Upgraded MEILI_MASTER_KEY in $env_file (previous value was too short or a placeholder)."
            ;;
    esac
    # Human: Catch custom short keys not listed above (e.g. copied from old docs).
    # Agent: LENGTH check on MEILI_MASTER_KEY value; REPLACE when <32 chars.
    current="$(grep '^MEILI_MASTER_KEY=' "$env_file" | head -n 1 | cut -d= -f2- | tr -d '\r')"
    if [ -n "$current" ] && [ "${#current}" -lt 32 ]; then
        secret="$(generate_secret)"
        tmp_file="${env_file}.meili.tmp"
        awk -v secret="$secret" '
            BEGIN { done = 0 }
            /^MEILI_MASTER_KEY=/ && !done { print "MEILI_MASTER_KEY=" secret; done = 1; next }
            { print }
        ' "$env_file" > "$tmp_file"
        mv "$tmp_file" "$env_file"
        echo "Upgraded MEILI_MASTER_KEY in $env_file (must be at least 32 characters)."
    fi
}

# Initialize root .env
init_env_file ".env" ".env.example"
upgrade_meili_master_key ".env"

# Initialize backend .env
init_env_file "backend/.env" "backend/.env.example"
upgrade_meili_master_key "backend/.env"

# Initialize nebula-os .env
init_env_file "nebula-os/.env" "nebula-os/.env.example"
