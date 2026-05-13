import { Link, useLocation } from "react-router-dom";

const labelMap: Record<string, string> = {
  "/admin": "Overview",
  "/admin/users": "Users",
  "/admin/listening": "User listening",
  "/admin/groups": "Groups",
  "/admin/library": "Library",
  "/admin/playlists": "Playlists",
  "/admin/settings": "Settings",
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const label = labelMap[pathname] || "Admin";

  return (
    <nav className="flex items-center gap-2 text-sm px-4 md:px-8 py-3 text-surface-500">
      <Link to="/" className="hover:text-white transition-colors">Home</Link>
      <span className="text-surface-700">/</span>
      <Link to="/admin" className="hover:text-white transition-colors">Admin</Link>
      <span className="text-surface-700">/</span>
      <span className="text-white font-medium">{label}</span>
    </nav>
  );
}
