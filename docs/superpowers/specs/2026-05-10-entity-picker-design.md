---
date: 2026-05-10
scope: Entity picker for song metadata fields (artist, album, album_artist, genre, studio)
type: feature
---

# Entity Picker for Song Metadata

## Summary

Replace the plain text inputs for Artist, Album, Album Artist, Genre, and Studio in `SongMetadataForm` with tappable buttons that open a fuzzy-searchable picker dialog. Users can select an existing value or create a new one.

## Motivation

Manually typing metadata values is error-prone and leads to inconsistent data (e.g., "The Beatles" vs "Beatles, The"). An entity picker ensures consistency, speeds up data entry via fuzzy search, and makes it trivial to reuse existing values.

## API Design

### `GET /api/v1/songs/values`

Returns distinct, non-null values from the `songs` table for a given column, optionally filtered by a search query.

**Query Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `field` | string | Yes | One of: `artist`, `album`, `album_artist`, `genre`, `studio` |
| `q` | string | No | Search string matched with `ILIKE '%' || $1 || '%'` |
| `limit` | number | No | Max results, default 20 |

**Response:** `200 OK`, `Content-Type: application/json`

```json
["value1", "value2", "value3"]
```

**Errors:**
- `400 Bad Request` — if `field` is missing or not in the allowed whitelist.

**Implementation Notes:**
- The handler validates `field` against a hardcoded whitelist before interpolating the column name into the SQL query.
- Results are ordered alphabetically (`ASC`).
- Null values are excluded.

## Frontend Architecture

### New Components

#### `EntityPickerDialog`

A generic, reusable dialog for selecting or creating a single string value.

**Props:**

```typescript
interface EntityPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  title: string;
  existingValues: string[];
  currentValue: string | null;
}
```

**Behavior:**
1. Renders a modal overlay matching the existing dark theme (`bg-surface-950`, `border-surface-700`).
2. Contains a search input at the top.
3. Filters the `existingValues` array using `fuse.js` fuzzy search as the user types.
4. Each matching value is rendered as a clickable row. The currently selected value is visually highlighted.
5. A "Create '<query>'" button appears at the bottom of the list, allowing the user to use the raw search text as a new value.
6. Pressing `Enter` with a non-empty search selects the top filtered result (or creates a new value if the list is empty).
7. Clicking outside the dialog or pressing `Escape` closes it without selection.

#### `EntityField`

Replaces the plain text `<input>` for the five metadata fields.

**Props:**

```typescript
interface EntityFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  entityType: "artist" | "album" | "album_artist" | "genre" | "studio";
}
```

**UI:**
- Renders as a button-like element (`div` with `role="button"`) showing the current value, or a placeholder text (e.g., "Select artist...") if null.
- Clicking it opens `EntityPickerDialog`.
- Includes a small clear (×) icon when a value is set, allowing quick removal.

### Modified Components

#### `SongMetadataForm`

- Replace the `<input>` elements for `artist`, `album`, `album_artist`, `genre`, and `studio` with `<EntityField>`.
- Keep `title`, `track_number`, and `year` as plain inputs.
- Fetch existing values for all five fields in parallel on mount using a new `fetchValues` API helper.
- Pass the fetched arrays to each corresponding `<EntityField>`.

### New API Helpers

Add to `frontend/src/api/client.ts`:

```typescript
export async function fetchValues(
  field: "artist" | "album" | "album_artist" | "genre" | "studio",
  q?: string,
  limit?: number
) {
  const qs = new URLSearchParams();
  qs.set("field", field);
  if (q) qs.set("q", q);
  if (limit !== undefined) qs.set("limit", String(limit));
  return apiFetch(`/songs/values?${qs.toString()}`) as Promise<string[]>;
}
```

## Data Flow

1. **`SongMetadataForm` mounts** → calls `fetchValues(...)` for all five entity types in parallel.
2. **Data arrives** → stored in local state, passed as `existingValues` to each `<EntityField>`.
3. **User clicks an `EntityField`** → `EntityPickerDialog` opens with the corresponding `existingValues`.
4. **User types in dialog search** → `fuse.js` filters the list client-side in real-time.
5. **User clicks a value or "Create new"** → `onSelect(value)` fires up through `EntityField`, updating the `SongDraft` in `SongMetadataForm`.
6. **Dialog closes** → user sees the updated button text in the form.

## Dependencies

- [`fuse.js`](https://fusejs.io/) — Lightweight fuzzy-search library for the frontend dialog filtering.

## Styling

- Dialog: `max-h-[60vh]`, `w-full max-w-md`, `rounded-xl`, `border border-surface-700`, `bg-surface-950`, `p-4`.
- Search input: Same styling as existing inputs (`inputClass` in `SongMetadataForm`).
- List items: `px-3 py-2`, `hover:bg-surface-800`, `rounded-lg`.
- Selected item: `bg-aurora-600/20`, `text-aurora-400`.
- Create button: `text-aurora-400`, `hover:text-aurora-300`.
- EntityField button: `w-full`, `rounded-lg`, `border border-surface-700`, `bg-surface-900`, `px-3 py-2`, `text-left`.

## Error Handling

- If the `/songs/values` request fails, the dialog still opens but shows an empty list. The user can still type and create a new value.
- Network errors are silently swallowed for the values fetch (logged to console) to avoid blocking the upload flow.

## Testing

- **Unit:** `EntityPickerDialog` filtering logic with mock data.
- **Unit:** `EntityField` correctly opens/closes dialog and propagates selection.
- **Integration:** Upload flow still works end-to-end with the new metadata form.
- **Backend:** Test `/songs/values` with each allowed field, invalid field returns 400.

## Scope Exclusions

- No autocomplete dropdown inside the form itself (only the dialog).
- No backend fuzzy search (backend does simple `ILIKE`; frontend handles fuzziness).
- No caching layer beyond React component state.
- No debouncing on the dialog search (fuse.js is fast enough for in-memory filtering).

## Open Questions

None at this time.
