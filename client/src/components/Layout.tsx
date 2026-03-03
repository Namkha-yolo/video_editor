import { Link, Outlet } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import "./Layout.css";

export default function Layout() {
  // TODO: Add navbar, auth guard, sidebar
  const user = useAuthStore((s) => s.user);
  const avatarLabel = user?.email?.[0]?.toUpperCase() ?? "U";

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__header-inner">
          <Link to="/dashboard" className="layout__brand">
            <img src="/logo.png" className="layout__brand-logo"></img>
            <span className="layout__brand-text">ClipVibe</span>
          </Link>
          <div className="layout__user">
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
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
