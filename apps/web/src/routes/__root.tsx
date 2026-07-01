import type { ReactNode } from "react";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import "../styles/global.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Personal Agent Platform" },
      {
        name: "description",
        content: "Local Personal Agent Platform control surface.",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-shell">
        <header className="topbar">
          <Link className="brand" to="/">
            <span className="brand-mark" aria-hidden="true">
              PA
            </span>
            <span>
              <span className="brand-title">Personal Agent Platform</span>
              <span className="brand-subtitle">local runtime</span>
            </span>
          </Link>
          <nav aria-label="Primary navigation" className="topbar-nav">
            <Link activeProps={{ "aria-current": "page" }} to="/">
              Run echo
            </Link>
            <Link
              activeProps={{ "aria-current": "page" }}
              search={{ includeArchived: false }}
              to="/workspaces"
            >
              Workspaces
            </Link>
            <Link activeProps={{ "aria-current": "page" }} to="/memory">
              Memory
            </Link>
          </nav>
        </header>
        <main id="main-content" className="page-frame">
          <Outlet />
        </main>
      </div>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
