CREATE TABLE IF NOT EXISTS permissions (
    id BLOB PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS groups (
    id BLOB PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS group_permissions (
    id BLOB PRIMARY KEY,
    group_id BLOB NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    permission_id BLOB NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (group_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id BLOB PRIMARY KEY,
    user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id BLOB NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (user_id, permission_id)
);

CREATE TABLE IF NOT EXISTS group_memberships (
    id BLOB PRIMARY KEY,
    user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id BLOB NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
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

-- Seed initial permissions with fixed UUIDs
INSERT OR IGNORE INTO permissions (id, key, name, description, category) VALUES
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
    ('10000000-0000-0000-0000-000000000011', 'admin.access', 'Admin Access', 'Access admin dashboard and APIs', 'admin');

-- Create Default group
INSERT OR IGNORE INTO groups (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Default', 'Default group for standard user access');

-- Create Admin group
INSERT OR IGNORE INTO groups (id, name, description) VALUES
    ('00000000-0000-0000-0000-000000000002', 'Admin', 'Full administrator access');

-- Assign Default group permissions (fixed UUIDs for group_permissions)
INSERT OR IGNORE INTO group_permissions (id, group_id, permission_id) VALUES
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003'),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004'),
    ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005'),
    ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007');

-- Assign Admin group permissions (all)
INSERT OR IGNORE INTO group_permissions (id, group_id, permission_id) VALUES
    ('21000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
    ('21000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
    ('21000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003'),
    ('21000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004'),
    ('21000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005'),
    ('21000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006'),
    ('21000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000007'),
    ('21000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000008'),
    ('21000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000009'),
    ('21000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000010'),
    ('21000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000011');

-- Migrate existing users into the Default group
INSERT OR IGNORE INTO group_memberships (id, user_id, group_id)
SELECT lower(hex(randomblob(16))), id, '00000000-0000-0000-0000-000000000001'
FROM users;

-- Also assign users with role 'admin' to the Admin group
INSERT OR IGNORE INTO group_memberships (id, user_id, group_id)
SELECT lower(hex(randomblob(16))), id, '00000000-0000-0000-0000-000000000002'
FROM users
WHERE role = 'admin';
