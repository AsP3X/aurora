// Human: Hard stop for non-admins — relies on permission list containing `admin.access` from the backend.
// Agent: READS can("admin.access"); RETURNS denial UI or children unchanged.
import { useAuth } from "../../context/AuthContext";

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can("admin.access")) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-surface-400">You do not have permission to access the admin dashboard.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
