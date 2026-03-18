import { Link, NavLink, Outlet } from "react-router-dom";
import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import "./Layout.css";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/upload", label: "Upload Clips" },
  { to: "/mood", label: "Choose Mood" },
];

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const avatarLabel = user?.email?.[0]?.toUpperCase() ?? "U";

  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("theme") as "dark" | "light") ?? "dark"
  );

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className={`layout${theme === "light" ? " layout--light" : ""}`}>
      <header className="layout__header">
        <div className="layout__header-inner">
          <Link to="/dashboard" className="layout__brand">
            <img
              src="/logo.png"
              className="layout__brand-logo"
              alt="ClipVibe logo"
            />
            <span className="layout__brand-text">ClipVibe</span>
          </Link>
          <div className="layout__user">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="layout__theme-toggle"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="User avatar"
                className="layout__avatar-image"
              />
            ) : (
              <div className="layout__avatar-fallback">{avatarLabel}</div>
            )}
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="layout__logout"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <div className="layout__body">
        <aside className="layout__sidebar">
          <nav className="layout__nav" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                // show which page is selected
                className={({ isActive }) =>
                  `layout__nav-link${isActive ? " layout__nav-link--active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="layout__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
