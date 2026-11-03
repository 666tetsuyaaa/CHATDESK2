import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ustpLogo from "../assets/1.png";
import UserAvatar from "./UserAvatar.jsx";

const NAV_SECTIONS = [
  {
    label: "Workspace",
    items: [
      {
        label: "Tickets",
        to: "/tickets",
        icon: (
          <path
            d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6V7ZM12 5v14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 3"
          />
        ),
      },
      {
        label: "FAQs",
        to: "/faqs",
        icon: (
          <path
            d="M9 9a3 3 0 1 1 4 2.83c-.6.25-1 .85-1 1.5V14M12 17.5h.01M4 5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 3V6a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        label: "Analytics Overview",
        to: "/analytics",
        icon: (
          <path
            d="M4 20V10M10 20V4M16 20v-7M22 20H2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      },
      {
        label: "Inquiry Logs",
        to: "/logs",
        icon: (
          <path
            d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 12h6M9 16h6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        label: "User Management",
        to: "/users",
        superAdminOnly: true,
        icon: (
          <path
            d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      },
      {
        label: "Announcements",
        to: "/announcements",
        superAdminOnly: true,
        icon: (
          <path
            d="M4 6h11l4-3v18l-4-3H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM8 15v3a2 2 0 0 0 2 2h1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      },
      {
        label: "Phases",
        to: "/phases",
        superAdminOnly: true,
        icon: (
          <path
            d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      },
      {
        label: "Offices",
        to: "/offices",
        superAdminOnly: true,
        icon: (
          <path
            d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      },
    ],
  },
];

const SETTINGS_ITEM = {
  label: "Settings",
  to: "/settings",
  icon: (
    <path
      d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

const LOGOUT_ICON = (
  <path
    d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

function roleLabel(currentUser) {
  if (currentUser?.role === "superadmin") return "Super Admin";
  if (currentUser?.role === "office_admin") return currentUser?.office_name ?? "Office Admin";
  return currentUser?.role ?? "";
}

function useStoredBoolean(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? defaultValue : stored === "true";
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Private-browsing / storage-disabled - the preference just won't persist.
    }
  }, [key, value]);

  return [value, setValue];
}

function NavItem({ item, isCollapsed, onNavigate }) {
  return (
    <NavLink
      to={item.to}
      title={isCollapsed ? item.label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-gold/60 ${
          isCollapsed ? "lg:justify-center lg:px-0" : ""
        } ${
          isActive
            ? "bg-glass font-semibold text-[#1B2A6B] shadow-sm"
            : "text-white/65 hover:bg-glass/10 hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-gold" />
          )}
          <svg
            className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 ${
              isActive ? "text-gold" : "text-current group-hover:scale-110"
            }`}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {item.icon}
          </svg>
          <span className={isCollapsed ? "lg:sr-only truncate" : "truncate"}>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ isMobileOpen = false, onCloseMobile = () => {} }) {
  const { currentUser, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useStoredBoolean("chatdesk_sidebar_collapsed", false);

  useEffect(() => {
    if (!isMobileOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  const isSuperAdmin = currentUser?.role === "superadmin";
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.superAdminOnly || isSuperAdmin),
  })).filter((section) => section.items.length > 0);

  const iconBtnClass =
    "border-white/15 text-white/60 hover:border-gold hover:text-white";

  return (
    <>
      {isMobileOpen && (
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen shrink-0 flex-col justify-between border-r border-white/10 bg-[rgb(var(--c-sidebar))] px-4 py-6 text-white transition-[transform,width] duration-300 ease-in-out lg:relative lg:z-auto ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 ${isCollapsed ? "lg:w-20" : "lg:w-64"} w-72`}
      >
        <div className="sidebar-scroll relative min-h-0 flex-1 overflow-y-auto">
          <div className={`mb-8 flex items-center gap-2.5 px-1 ${isCollapsed ? "lg:justify-center" : ""}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-glass/10 p-1.5 ring-1 ring-white/20">
              <img src={ustpLogo} alt="ChatDesk logo" className="h-full w-full object-contain" />
            </div>
            <div className={`min-w-0 leading-tight ${isCollapsed ? "lg:hidden" : ""}`}>
              <span className="block font-plus-jakarta text-lg font-bold text-white">
                Chat<span className="text-gold">Desk</span>
              </span>
              <span className="block text-[11px] text-white/55">Admin Console</span>
            </div>

            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
              className={`ml-auto hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gold/60 lg:flex ${iconBtnClass} ${
                isCollapsed ? "lg:hidden" : ""
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close menu"
              className={`ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gold/60 lg:hidden ${iconBtnClass}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {isCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              aria-label="Expand sidebar"
              aria-expanded={false}
              className={`mx-auto mb-6 hidden h-7 w-7 items-center justify-center rounded-lg border outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-gold/60 lg:flex ${iconBtnClass}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          <nav className="space-y-6">
            {visibleSections.map((section) => (
              <div key={section.label}>
                <p
                  className={`mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55 ${
                    isCollapsed ? "lg:sr-only" : ""
                  }`}
                >
                  {section.label}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <NavItem key={item.label} item={item} isCollapsed={isCollapsed} onNavigate={onCloseMobile} />
                  ))}
                </div>
              </div>
            ))}

            <div className="border-t border-white/10 pt-4">
              <NavItem item={SETTINGS_ITEM} isCollapsed={isCollapsed} onNavigate={onCloseMobile} />
            </div>
          </nav>
        </div>

        <div className="relative mt-4 shrink-0">
          <div
            className={`flex items-center gap-2.5 rounded-2xl border border-white/10 bg-glass/5 p-2.5 ${
              isCollapsed ? "lg:flex-col lg:border-transparent lg:bg-transparent lg:p-0" : ""
            }`}
          >
            <UserAvatar
              user={currentUser}
              ringClass="ring-2 ring-gold/70 ring-offset-2 ring-offset-[rgb(var(--c-sidebar))]"
            />
            <div className={`min-w-0 flex-1 ${isCollapsed ? "lg:hidden" : ""}`}>
              <p className="truncate text-sm font-semibold leading-tight text-white" title={currentUser?.email}>
                {currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}` : currentUser?.email}
              </p>
              <p className="truncate text-xs leading-tight text-white/60">{roleLabel(currentUser)}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Log Out"
              aria-label="Log Out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 outline-none transition-colors duration-150 hover:bg-glass/10 hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {LOGOUT_ICON}
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
