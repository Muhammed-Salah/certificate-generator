"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  FileImage,
  PlusCircle,
  Settings,
  LogOut,
  Menu,
  X,
  Award,
  ChevronRight,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/templates", icon: FileImage, label: "Templates" },
  { href: "/dashboard/generate", icon: Award, label: "Generate" },
  { href: "/dashboard/fonts", icon: Settings, label: "Fonts" },
];

export default function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  const initials = (user.user_metadata?.full_name || user.email || "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
        fixed inset-y-0 left-0 z-50 w-60 flex flex-col
        bg-ink-950 text-parchment-100
        transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 lg:flex-shrink-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-ink-800">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #c9a84c, #e8c96d)" }}
          >
            <Award size={16} className="text-ink-950" />
          </div>
          <span className="font-display text-xl font-medium tracking-tight">Certify</span>
          <button
            className="ml-auto lg:hidden text-ink-400 hover:text-parchment-100 p-1"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => {
                  if (typeof window !== "undefined" && window.__unsavedChanges) {
                    if (!confirm("You have unsaved changes. Are you sure you want to leave?")) {
                      e.preventDefault();
                      return;
                    }
                  }
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                                transition-all duration-150 group ${
                                  active
                                    ? "bg-parchment-100/10 text-parchment-100"
                                    : "text-ink-300 hover:text-parchment-100 hover:bg-parchment-100/5"
                                }`}
              >
                <Icon
                  size={16}
                  className={active ? "text-accent-gold" : "text-ink-400 group-hover:text-ink-200"}
                />
                {label}
                {active && <ChevronRight size={14} className="ml-auto text-ink-500" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-ink-800 p-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-ink-900 flex-shrink-0 overflow-hidden" 
                 style={{ background: "linear-gradient(135deg, #c9a84c, #e8c96d)" }}>
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt={user.user_metadata.full_name || 'User avatar'} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-parchment-100 truncate">
                {user.user_metadata?.full_name || "User"}
              </p>
              <p className="text-xs text-ink-400 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 text-ink-400 hover:text-red-400 rounded transition-colors"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-ink-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-ink-600 hover:text-ink-900 rounded-lg hover:bg-ink-50"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Award size={18} className="text-accent-gold" />
            <span className="font-display text-lg text-ink-900">Certify</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">{children}</div>

        {/* Floating Actions */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
          {/* Chai4Me Support Button */}
          <a 
            href="https://chai4.me/salah" 
            target="_blank" 
            title="Support salah on Chai4Me" 
            className="pointer-events-auto transition-transform duration-200 hover:scale-105 active:scale-95 shadow-xl rounded-2xl overflow-hidden"
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#ffffff',
              padding: '8px 24px',
              borderRadius: '16px',
              textDecoration: 'none',
              border: '1px solid #e5e7eb',
            }}
          >
            <img 
              src="https://chai4.me/icons/wordmark.png" 
              alt="Chai4Me" 
              style={{ height: '28px', objectFit: 'contain' }}
            />
          </a>

          {/* Credit Label */}
          <a
            href="https://www.linkedin.com/in/muhammed-salah-kt/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/40 shadow-sm flex items-center gap-2 pointer-events-auto hover:bg-white/80 transition-all duration-200"
          >
            <span className="text-[10px] font-medium text-ink-500 whitespace-nowrap">
              Made with ❤️ by <span className="font-bold underline">Salah</span> using <span className="font-bold">AI</span>.
            </span>
          </a>
        </div>
      </main>
    </div>
  );
}
