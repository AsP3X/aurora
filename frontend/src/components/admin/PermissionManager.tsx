interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
}

interface PermissionManagerProps {
  permissions: Permission[];
  assignedKeys: string[];
  onChange: (keys: string[]) => void;
  readOnly?: boolean;
}

export default function PermissionManager({
  permissions,
  assignedKeys,
  onChange,
  readOnly = false,
}: PermissionManagerProps) {
  const categories = [...new Set(permissions.map((p) => p.category))];

  return (
    <div className="space-y-4">
      {categories.map((cat) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">{cat}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {permissions
              .filter((p) => p.category === cat)
              .map((p) => (
                <label
                  key={p.key}
                  className={`flex items-center gap-2 text-sm text-surface-300 ${
                    readOnly ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={assignedKeys.includes(p.key)}
                    onChange={(e) => {
                      if (readOnly) return;
                      if (e.target.checked) {
                        onChange([...assignedKeys, p.key]);
                      } else {
                        onChange(assignedKeys.filter((k) => k !== p.key));
                      }
                    }}
                    className="rounded border-white/10 bg-surface-900 text-aurora-500 focus:ring-aurora-500"
                    disabled={readOnly}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
