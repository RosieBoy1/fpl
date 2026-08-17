"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchPlayers, type PlayerRow } from "@/lib/api";
import { FixtureChip } from "@/components/FixtureChip";

type SortKey = "xp_next_n" | "total_points" | "form" | "now_cost_m" | "selected_by_percent";
type PositionFilter = "ALL" | "GKP" | "DEF" | "MID" | "FWD";

const SORT_LABELS: Record<SortKey, string> = {
  xp_next_n: "Expected points (next 5)",
  total_points: "Total points",
  form: "Form",
  now_cost_m: "Price",
  selected_by_percent: "Ownership",
};

export default function Home() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("xp_next_n");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchPlayers()
      .then(setPlayers)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    let filtered = players;
    if (position !== "ALL") {
      filtered = filtered.filter((p) => p.position === position);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.web_name.toLowerCase().includes(q) ||
          p.team_short_name.toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [players, position, sortKey, search]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-blue-50 to-sky-50 p-6 text-slate-800">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-blue-100 border-b-4 border-b-amber-400 bg-white px-5 py-4 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">FPL Companion</h1>
            <p className="mt-1 text-sm text-slate-500">
              Player dashboard — price, form, ownership, next 5 fixtures (colored by our own
              Elo-based difficulty model, not FPL&apos;s FDR).
            </p>
          </div>
          <div className="flex shrink-0 gap-4">
            <Link
              href="/optimize"
              className="text-sm font-medium text-blue-700 transition-colors hover:text-amber-600"
            >
              Squad optimizer &rarr;
            </Link>
            <Link
              href="/accuracy"
              className="text-sm font-medium text-blue-700 transition-colors hover:text-amber-600"
            >
              Model accuracy &rarr;
            </Link>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search player or team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-amber-400 focus:outline-none"
          />

          <div className="flex gap-1">
            {(["ALL", "GKP", "DEF", "MID", "FWD"] as PositionFilter[]).map((pos) => (
              <button
                key={pos}
                onClick={() => setPosition(pos)}
                className={`rounded-lg px-2.5 py-1 text-sm transition-colors ${
                  position === pos
                    ? "bg-amber-500 font-semibold text-slate-900 shadow-sm"
                    : "border border-blue-200 bg-white text-slate-600 hover:border-amber-300"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-sm shadow-sm"
          >
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                Sort: {label}
              </option>
            ))}
          </select>

          {!loading && (
            <span className="text-sm text-slate-500">{rows.length} players</span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Couldn&apos;t load players: {error}. Is the backend running at{" "}
            {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}?
          </div>
        )}

        {loading && <p className="text-sm text-slate-500">Loading players…</p>}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-xl border border-blue-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Form</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                  <th className="px-3 py-2 text-right">Own %</th>
                  <th className="px-3 py-2 text-right">xP (5)</th>
                  <th className="px-3 py-2">Next 5</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-blue-50 hover:bg-sky-50">
                    <td className="px-3 py-2 font-medium">
                      {p.web_name}
                      {p.status !== "a" && (
                        <span className="ml-1 text-xs text-red-500" title={p.news}>
                          ⚠
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.team_short_name}</td>
                    <td className="px-3 py-2 text-slate-600">{p.position}</td>
                    <td className="px-3 py-2 text-right">£{p.now_cost_m.toFixed(1)}m</td>
                    <td className="px-3 py-2 text-right">{p.form.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{p.total_points}</td>
                    <td className="px-3 py-2 text-right">
                      {p.selected_by_percent.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-700">
                      {p.xp_next_n.toFixed(1)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {p.next_fixtures.map((f, i) => (
                          <FixtureChip key={i} fixture={f} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
