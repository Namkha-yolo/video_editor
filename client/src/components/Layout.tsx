import { Outlet } from "react-router-dom";

export default function Layout() {
  // TODO: Add navbar, auth guard, sidebar
  return (
    <div className="min-h-screen bg-gray-950">
      <header>{/* TODO: Navbar with user avatar, logout */}</header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
