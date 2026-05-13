import { useState, useEffect, useCallback } from "react";
import { fetchAdminSettings, updateAdminSetting } from "../../api/client";

interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminSettings();
      setSettings(data);
    } catch (e: any) {
      setError(e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleSave(key: string) {
    setSaving(true);
    try {
      await updateAdminSetting(key, editValue);
      setSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value: editValue, updated_at: new Date().toISOString() } : s))
      );
      setEditingKey(null);
    } catch (e: any) {
      setError(e.message || "Failed to update setting");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newKey.trim()) return;
    setSaving(true);
    try {
      await updateAdminSetting(newKey.trim(), newValue);
      setSettings((prev) => [
        ...prev,
        { key: newKey.trim(), value: newValue, updated_at: new Date().toISOString() },
      ]);
      setAdding(false);
      setNewKey("");
      setNewValue("");
    } catch (e: any) {
      setError(e.message || "Failed to add setting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <div className="flex items-center gap-3">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            onClick={() => setAdding(true)}
            className="text-sm text-aurora-400 hover:text-aurora-300 px-3 py-1.5 rounded-lg hover:bg-aurora-500/10 transition-colors border border-aurora-500/20"
          >
            Add Setting
          </button>
        </div>
      </div>

      <div className="bg-surface-900 border border-white/5 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[500px]">
          <thead className="text-xs text-surface-400 uppercase bg-surface-950/50 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {adding && (
              <tr className="bg-aurora-500/5">
                <td className="px-4 py-3">
                  <input
                    autoFocus
                    placeholder="key"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                    className="w-full px-2 py-1 bg-surface-950 border border-white/10 rounded text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    placeholder="value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                    className="w-full px-2 py-1 bg-surface-950 border border-white/10 rounded text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-aurora-500"
                  />
                </td>
                <td className="px-4 py-3 text-surface-400 text-xs">—</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={handleAdd}
                    disabled={saving || !newKey.trim()}
                    className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setAdding(false); setNewKey(""); setNewValue(""); }}
                    className="text-xs text-surface-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors ml-2"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            )}
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                  <div className="w-5 h-5 border-2 border-aurora-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : settings.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                  No settings found.
                </td>
              </tr>
            ) : (
              settings.map((s) => (
                <tr key={s.key} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white font-mono text-xs">{s.key}</td>
                  <td className="px-4 py-3 text-surface-300">
                    {editingKey === s.key ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave(s.key);
                          if (e.key === "Escape") setEditingKey(null);
                        }}
                        className="w-full px-2 py-1 bg-surface-950 border border-white/10 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-aurora-500"
                      />
                    ) : (
                      <span className="break-all">{s.value}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-surface-400 text-xs">{new Date(s.updated_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    {editingKey === s.key ? (
                      <button
                        onClick={() => handleSave(s.key)}
                        disabled={saving}
                        className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingKey(s.key);
                          setEditValue(s.value);
                        }}
                        className="text-xs text-aurora-400 hover:text-aurora-300 px-2 py-1 rounded hover:bg-aurora-500/10 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
