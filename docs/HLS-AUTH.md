# HLS authentication model

Aurora uses **two** patterns for protected media:

## Progressive stream and artwork (ticket URLs)

1. Authenticated client calls `GET /api/v1/songs/{id}/stream-url` or `artwork-url` with a Bearer JWT.
2. API returns a relative URL with a short-lived HMAC **ticket** query parameter.
3. The browser or `<audio>` element fetches `/api/v1/songs/{id}/stream?ticket=…` on the **public** router (no `Authorization` header).
4. Redemption checks the ticket signature, expiry, and that the song row is **`enabled = true`**.

## HLS (playlist, key, segments)

HLS routes stay on the **protected** router:

- `GET /api/v1/songs/{id}/playlist`
- `GET /api/v1/songs/{id}/key`
- `GET /api/v1/songs/{id}/segments/{name}`

Each request requires `Authorization: Bearer <JWT>` and `library.view`. Segment fetches are rate-limited per user and song.

Native players that cannot attach Bearer tokens to every segment request should use the progressive stream path until ticketized segment URLs are implemented.
