CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT DEFAULT (now()::text)
);

CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (now()::text),
    updated_at TEXT DEFAULT (now()::text)
);

CREATE TABLE IF NOT EXISTS group_permissions (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (now()::text),
    UNIQUE (group_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (now()::text),
    UNIQUE (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS group_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (now()::text),
    UNIQUE (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_permissions_key ON permissions(key);
CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category);
CREATE INDEX IF NOT EXISTS idx_group_permissions_group_id ON group_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_permissions_permission_id ON group_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON user_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_user_id ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_id ON group_memberships(group_id);

-- Seed initial permissions
INSERT INTO permissions (id, key, name, description, category) VALUES
    ('10000000-0000-0000-0000-000000000001', 'library.view', 'View Library', 'View the song library', 'library'),
    ('10000000-0000-0000-0000-000000000002', 'library.manage', 'Manage Library', 'Scan, upload, and manage songs', 'library'),
    ('10000000-0000-0000-0000-000000000003', 'playlists.create', 'Create Playlists', 'Create new playlists', 'playlists'),
    ('10000000-0000-0000-0000-000000000004', 'playlists.update', 'Update Playlists', 'Update own playlists', 'playlists'),
    ('10000000-0000-0000-0000-000000000005', 'playlists.delete', 'Delete Playlists', 'Delete own playlists', 'playlists'),
    ('10000000-0000-0000-0000-000000000006', 'playlists.view_all', 'View All Playlists', 'View any playlist including private ones', 'playlists'),
    ('10000000-0000-0000-0000-000000000007', 'history.view', 'View History', 'View own playback history', 'history'),
    ('10000000-0000-0000-0000-000000000008', 'history.view_all', 'View All History', 'View all users playback history', 'history'),
    ('10000000-0000-0000-0000-000000000009', 'users.manage', 'Manage Users', 'Create, update, and delete users', 'admin'),
    ('10000000-0000-0000-0000-000000000010', 'settings.manage', 'Manage Settings', 'Manage system settings', 'admin'),
    ('10000000-0000-0000-0000-000000000011', 'admin.access', 'Admin Access', 'Access admin dashboard and APIs', 'admin')
ON CONFLICT (key) DO NOTHING;

-- Create Default group
INSERT INTO groups (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Default', 'Default group for standard user access')
ON CONFLICT (name) DO NOTHING;

-- Create Admin group
INSERT INTO groups (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000002', 'Admin', 'Full administrator access')
ON CONFLICT (name) DO NOTHING;

-- Assign Default group permissions
INSERT INTO group_permissions (id, group_id, permission_id)
SELECT gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', id
FROM permissions
WHERE key IN ('library.view', 'playlists.create', 'playlists.update', 'playlists.delete', 'history.view')
ON CONFLICT (group_id, permission_id) DO NOTHING;

-- Assign Admin group permissions (all)
INSERT INTO group_permissions (id, group_id, permission_id)
SELECT gen_random_uuid()::text, '00000000-0000-0000-0000-000000000002', id
FROM permissions
ON CONFLICT (group_id, permission_id) DO NOTHING;

-- Migrate existing users into the Default group
INSERT INTO group_memberships (id, user_id, group_id)
SELECT gen_random_uuid()::text, id, '00000000-0000-0000-0000-000000000001'
FROM users
ON CONFLICT (user_id, group_id) DO NOTHING;

-- Also assign users with role 'admin' to the Admin group
INSERT INTO group_memberships (id, user_id, group_id)
SELECT gen_random_uuid()::text, id, '00000000-0000-0000-0000-000000000002'
FROM users
WHERE role = 'admin'
ON CONFLICT (user_id, group_id) DO NOTHING;
