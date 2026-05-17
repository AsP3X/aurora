// Human: Admin area chrome — top bar, collapsible sidebar, and nested route outlet below breadcrumbs.
// Agent: LOCAL sidebarOpen; RENDERS AdminTopbar+AdminSidebar+Outlet; OFFSETS main md:ml-64.
import { useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import Breadcrumbs from "./Breadcrumbs";

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-950 text-white flex flex-col">
      <AdminTopbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
      <AdminSidebar mobileOpen={sidebarOpen} onCloseMobile={() => setSidebarOpen(false)} />
      <div className="md:ml-64 flex-1 flex flex-col min-h-[calc(100vh-4rem)]">
        <Breadcrumbs />
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
