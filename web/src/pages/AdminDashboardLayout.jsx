import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../utils/theme.js";

const PAGE_META = {
  "/users": { title: "User Management", subtitle: "View and manage OSA and student accounts" },
  "/tickets": { title: "Tickets", subtitle: "Review and resolve escalated student inquiries" },
  "/faqs": { title: "FAQs", subtitle: "Maintain the chatbot's knowledge base" },
  "/analytics": { title: "Analytics Overview", subtitle: "Inquiry trends and ticket performance" },
  "/logs": { title: "Inquiry Logs", subtitle: "Raw chatbot conversation history" },
  "/announcements": { title: "Announcements", subtitle: "Broadcast updates to all students" },
  "/phases": { title: "Phases", subtitle: "Manage USTP calendar phases and student guidance" },
  "/offices": { title: "Offices", subtitle: "Manage offices and colleges for routing FAQs and tickets" },
  "/settings": { title: "Settings", subtitle: "Manage your account" },
};

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Dark mode" : "Light mode"}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white/60 text-gray-500 outline-none transition-all duration-150 hover:border-gray-300 hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/60"
    >
      {isLight ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

export default function AdminDashboardLayout() {
  const { pathname } = useLocation();
  const { currentUser } = useAuth();
  const meta = PAGE_META[pathname] ?? { title: "Super Admin Dashboard", subtitle: "" };
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-app text-navy">
      <Sidebar isMobileOpen={isMobileSidebarOpen} onCloseMobile={() => setIsMobileSidebarOpen(false)} />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <header className="relative z-10 flex shrink-0 items-center gap-3 bg-white px-5 py-4 shadow-sm sm:px-8">
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-navy outline-none transition-colors duration-150 hover:border-gold focus-visible:ring-2 focus-visible:ring-gold/60 lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="hidden text-xs font-medium text-gray-400 sm:block">
              ChatDesk <span className="mx-1 text-gray-300">/</span>
              <span className="text-gray-500">{meta.title}</span>
            </p>
            <h2 className="truncate font-plus-jakarta text-xl font-bold tracking-tight text-navy sm:text-2xl">
              {meta.title}
            </h2>
            {meta.subtitle && <p className="mt-0.5 hidden truncate text-sm text-gray-500 md:block">{meta.subtitle}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <ThemeToggle />
            <Link
              to="/settings"
              title="Account settings"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <span className="sr-only">Account settings</span>
              <UserAvatar
                user={currentUser}
                className="h-10 w-10"
                ringClass="ring-2 ring-gold/70 ring-offset-2 ring-offset-[rgb(var(--c-surface))]"
              />
            </Link>
          </div>
        </header>
        <main className="app-scroll relative z-0 flex-1 overflow-y-auto p-5 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
