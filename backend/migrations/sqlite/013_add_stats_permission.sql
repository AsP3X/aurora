INSERT OR IGNORE INTO permissions (id, key, name, description, category) VALUES
    ('10000000-0000-0000-0000-000000000012', 'stats.view', 'View Stats', 'View personal listening statistics', 'stats');

INSERT OR IGNORE INTO group_permissions (id, group_id, permission_id) VALUES
    ('20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000012');

INSERT OR IGNORE INTO group_permissions (id, group_id, permission_id) VALUES
    ('21000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000012');
