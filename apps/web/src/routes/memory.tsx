import type { ReactNode } from "react";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { SafeError } from "../features/executions/components";
import { MemoryTabs } from "../features/memory/components";
import {
  listEpisodicMemory,
  listProposedSemanticMemory,
  listSemanticMemory,
} from "../features/memory/server";

export const Route = createFileRoute("/memory")({
  loader: async () => {
    const [semantic, episodic, proposed] = await Promise.all([
      listSemanticMemory({ data: { limit: 5 } }),
      listEpisodicMemory({ data: { limit: 5 } }),
      listProposedSemanticMemory({ data: { limit: 100 } }),
    ]);

    return {
      semantic,
      episodic,
      proposed,
    };
  },
  component: MemoryOverviewRoute,
});

function MemoryOverviewRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname !== "/memory") {
    return <Outlet />;
  }

  return <MemoryOverviewContent />;
}

function MemoryOverviewContent() {
  const { semantic, episodic, proposed } = Route.useLoaderData();

  return (
    <>
      <section className="page-header" aria-labelledby="memory-title">
        <span className="eyebrow">PAP-045</span>
        <h1 className="page-title" id="memory-title">
          Memory
        </h1>
        <p className="page-copy">Inspect semantic facts, task episodes, and proposed memory.</p>
      </section>

      <MemoryTabs active="overview" />

      <div className="dashboard-grid">
        <OverviewPanel
          count={semantic.ok ? semantic.records.length : null}
          href="/memory/semantic"
          label="active records"
          title="Semantic memory"
        >
          {semantic.ok ? null : <SafeError error={semantic.error} />}
        </OverviewPanel>
        <OverviewPanel
          count={episodic.ok ? episodic.records.length : null}
          href="/memory/episodes"
          label="recent episodes"
          title="Episodic memory"
        >
          {episodic.ok ? null : <SafeError error={episodic.error} />}
        </OverviewPanel>
        <OverviewPanel
          count={proposed.ok ? proposed.records.length : null}
          href="/memory/semantic?status=proposed"
          label="awaiting review"
          title="Proposed semantic"
        >
          {proposed.ok ? null : <SafeError error={proposed.error} />}
        </OverviewPanel>
      </div>
    </>
  );
}

function OverviewPanel({
  children,
  count,
  href,
  label,
  title,
}: {
  count: number | null;
  href: string;
  label: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="section-panel" aria-labelledby={`${title}-title`}>
      <div className="section-heading">
        <h2 id={`${title}-title`}>{title}</h2>
        <span>{label}</span>
      </div>
      {count === null ? children : <p className="stat-value">{count}</p>}
      <a className="text-link" href={href}>
        Open
      </a>
    </section>
  );
}
