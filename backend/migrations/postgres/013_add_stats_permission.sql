INSERT INTO permissions (id, key, name, description, category) VALUES
    ('10000000-0000-0000-0000-000000000012', 'stats.view', 'View Stats', 'View personal listening statistics', 'stats')
ON CONFLICT (key) DO NOTHING;

INSERT INTO group_permissions (id, group_id, permission_id)
SELECT gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', id
FROM permissions WHERE key = 'stats.view'
ON CONFLICT (group_id, permission_id) DO NOTHING;

INSERT INTO group_permissions (id, group_id, permission_id)
SELECT gen_random_uuid()::text, '00000000-0000-0000-0000-000000000002', id
FROM permissions WHERE key = 'stats.view'
ON CONFLICT (group_id, permission_id) DO NOTHING;
