# Edit Song Artwork — Design

## Goal
Allow admins to add, replace, crop, and remove artwork on existing songs through the "Edit Song" dialog in the admin library.

## Context
The upload flow already supports a full artwork lifecycle (extract, crop, replace, remove) via `UploadSongDialog` and `ArtworkCropper`. The edit dialog (`AdminLibraryPage`) currently only supports text metadata. The backend `PUT /admin/songs/{id}` only accepts JSON and ignores artwork entirely.

## Frontend Changes

### AdminLibraryPage.tsx
- Add artwork-related state when `editingSong` is set:
  - `imageSrc: string | null` — seeded from `artworkUrl(song.id)` when `song.artwork_key` exists, otherwise null
  - `croppedBlob: Blob | null`
  - `artworkChanged: boolean` — tracks whether the user interacted with the artwork section
  - `removeArtwork: boolean`
- Include `<ArtworkCropper>` between the metadata grid and the action buttons.
- On save:
  - If `artworkChanged` or `removeArtwork` is true, call `updateAdminSong` with the text fields, `croppedBlob`, and `removeArtwork` flag.
  - Otherwise, call the existing JSON-only `updateAdminSong`.
- Reset artwork state when the dialog closes.

### api/client.ts
- Change `updateAdminSong` signature:
  ```ts
  export async function updateAdminSong(
    id: string,
    body: Partial<Pick<Song, "title" | "artist" | "album" | "album_artist" | "track_number" | "year" | "genres" | "studio">>,
    artworkBlob?: Blob,
    removeArtwork?: boolean
  ): Promise<Song>
  ```
- Build `FormData` when `artworkBlob` or `removeArtwork` is provided:
  - Append `metadata` as a JSON blob.
  - Append `artwork` file part if `artworkBlob` exists and `removeArtwork` is false.
  - Send as `multipart/form-data` `PUT` request.
- Fall back to the existing JSON `PUT` for text-only edits.

## Backend Changes

### admin/handlers.rs — `update_song`
- Change handler to accept `Multipart` instead of `Json`.
- Parse fields:
  - `metadata` — JSON matching the existing `UpdateSongBody` fields plus optional `remove_artwork: bool`.
  - `artwork` — optional image file.
- Fetch the song's current `artwork_key` before the update (for cleanup).
- Artwork logic:
  1. If `remove_artwork` is true and there is an existing key: delete the old file from storage and set `artwork_key = NULL`.
  2. If `artwork` is present: validate non-empty, generate a new key (`artwork/{id}.{ext}`), store to object storage, delete the old file if any, and include the new `artwork_key` in the update.
  3. Otherwise, preserve the existing `artwork_key`.
- Run the existing text-field update and genre replacement logic inside a transaction.
- Return the updated `Song`.

### Error Handling
- Storage delete failure on old artwork: log a warning, do not fail the update (consistent with `delete_song`).
- Storage put failure on new artwork: abort the transaction and return `AppError::Storage`.
- Empty artwork payload: return `AppError::BadRequest`.

## Data Flow
```
AdminLibraryPage
  ├─ openEditDialog → seed imageSrc from artworkUrl(song.id)
  ├─ ArtworkCropper → onCropComplete / onReplace / onRemove
  └─ handleSaveEdit
       ├─ artworkChanged=false → JSON PUT
       └─ artworkChanged=true  → multipart PUT (metadata + optional artwork)

Backend update_song
  ├─ parse multipart
  ├─ fetch current artwork_key
  ├─ (remove?)  → delete old storage key, set NULL
  ├─ (replace?) → store new blob, delete old key, set new key
  └─ update text fields & genres in transaction
```

## Scope & Exclusions
- In scope: artwork add, replace, crop, remove in the edit dialog.
- Out of scope: batch artwork editing, automatic artwork fetching from external services, artwork editing in the public library.

## Testing Notes
- Text-only edit still works (backward compatibility via JSON PUT).
- Replace artwork: old file cleaned up, new file served.
- Remove artwork: old file cleaned up, `artwork_key` becomes NULL, UI shows placeholder.
- Add artwork to song without one: works correctly.
