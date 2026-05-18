// Human: Helpers for the first-run database wizard—build SQLx URLs and mirror docker-compose Postgres defaults.
// Agent: PURE functions; DEFAULT_POSTGRES_URL matches compose postgres service; buildPostgresUrl encodes credentials.

export type DatabaseDriver = "postgres" | "sqlite";

/** Fields matching `docker-compose.yml` postgres service defaults. */
export interface PostgresConnectionFields {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

// Human: Same credentials as the bundled Postgres container so Docker users can accept defaults.
// Agent: host=postgres; user/password/db=aurora; port=5432; matches DATABASE_URL in compose.
export const DOCKER_POSTGRES_DEFAULTS: PostgresConnectionFields = {
  host: "postgres",
  port: "5432",
  user: "aurora",
  password: "aurora",
  database: "aurora",
};

export const DEFAULT_SQLITE_PATH = "aurora.db";

// Human: Compose a postgres:// URL from discrete host/user fields shown in the connection dialog.
// Agent: encodeURIComponent on user/password; RETURNS postgres://user:pass@host:port/db.
export function buildPostgresUrl(fields: PostgresConnectionFields): string {
  const user = encodeURIComponent(fields.user);
  const password = encodeURIComponent(fields.password);
  return `postgres://${user}:${password}@${fields.host}:${fields.port}/${fields.database}`;
}

export const DEFAULT_POSTGRES_URL = buildPostgresUrl(DOCKER_POSTGRES_DEFAULTS);

// Human: Normalize a SQLite file path into the sqlite:// URL form the backend expects.
// Agent: PREFIX sqlite:// when missing; TRIM input.
export function buildSqliteUrl(filePath: string): string {
  const trimmed = filePath.trim();
  if (trimmed.startsWith("sqlite:")) {
    return trimmed;
  }
  return `sqlite://${trimmed}`;
}

// Human: Infer postgres form fields from an existing URL so the dialog can pre-fill after server fetch.
// Agent: PARSE URL; RETURNS partial fields or null on parse failure.
export function parsePostgresUrl(url: string): PostgresConnectionFields | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return null;
    }
    return {
      host: parsed.hostname,
      port: parsed.port || "5432",
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, "") || "aurora",
    };
  } catch {
    return null;
  }
}

// Human: Strip the sqlite:// prefix for display in the file-path input.
// Agent: READS sqlite: or sqlite:// prefixes; RETURNS bare path string.
export function sqlitePathFromUrl(url: string): string {
  if (url.startsWith("sqlite://")) {
    return url.slice("sqlite://".length);
  }
  if (url.startsWith("sqlite:")) {
    return url.slice("sqlite:".length);
  }
  return url;
}
