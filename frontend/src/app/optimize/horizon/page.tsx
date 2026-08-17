"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchHorizonSquad, type HorizonResult, type HorizonSquadPlayer } from "@/lib/api";

const POSITION_ORDER = ["GKP", "DEF", "MID", "FWD"] as const;

function PlayerCard({ player }: { player: HorizonSquadPlayer }) {
  return (
    <div className="flex min-w-[110px] flex-col items-center rounded border border-gray-200 bg-white px-2 py-2 text-center shadow-sm">
      <div className="text-sm font-medium">{player.web_name}</div>
      <div className="text-xs text-gray-500">{player.team_short_name}</div>
      <div className="text-xs text-gray-400">£{player.cost_m.toFixed(1)}m</div>
      <div className="text-xs font-semibold text-emerald-700">{player.xp_total.toFixed(2)} xP</div>
    </div>
  );
}

export default function HorizonPage() {
  const [weeks, setWeeks] = useState(5);
  const [result, setResult] = useState<HorizonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchHorizonSquad(weeks));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mx-auto max-w-4xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Multi-Gameweek Horizon</h1>
          <Link href="/optimize" className="text-sm text-blue-600 hover:underline">
            &larr; Squad optimizer
          </Link>
        </div>
        <p className="mb-6 text-sm text-gray-500">
          One static squad/XI held across the next N gameweeks — the captain is
          re-optimized independently each week (squad doesn&apos;t change, the armband
          does), which naturally accounts for fixture swings across the horizon. Chip
          usage (wildcard, bench boost, triple captain, free hit) isn&apos;t modeled —
          each one changes the rules for a single week in a materially different way
          and is a separate, larger piece of work.
        </p>

        <div className="mb-6 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Gameweeks
            <input
              type="number"
              min={1}
              max={10}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="w-16 rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Solving…" : "Build horizon squad"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Couldn&apos;t optimize: {error}
          </div>
        )}

        {result && (
          <>
            <div className="mb-6 flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-500">Total cost: </span>
                <span className="font-semibold">£{result.total_cost_m.toFixed(1)}m</span>
              </div>
              <div>
                <span className="text-gray-500">
                  Total expected points (GWs {result.events[0]}-
                  {result.events[result.events.length - 1]}, with weekly captaincy):{" "}
                </span>
                <span className="font-semibold text-emerald-700">
                  {result.total_horizon_xp.toFixed(2)}
                </span>
              </div>
            </div>

            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Starting XI</h2>
            <div className="mb-6 flex flex-col gap-3 rounded-lg bg-emerald-50 p-4">
              {POSITION_ORDER.map((pos) => {
                const players = result.starting_xi.filter((p) => p.position === pos);
                if (players.length === 0) return null;
                return (
                  <div key={pos} className="flex flex-wrap justify-center gap-2">
                    {players.map((p) => (
                      <PlayerCard key={p.id} player={p} />
                    ))}
                  </div>
                );
              })}
            </div>

            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Bench</h2>
            <div className="mb-8 flex flex-wrap gap-2">
              {result.bench.map((p) => (
                <PlayerCard key={p.id} player={p} />
              ))}
            </div>

            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">
              Weekly captain schedule
            </h2>
            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Gameweek</th>
                    <th className="px-3 py-2">Captain</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2 text-right">XI xP that week</th>
                  </tr>
                </thead>
                <tbody>
                  {result.weekly_captains.map((wc) => (
                    <tr key={wc.event} className="border-t border-gray-100">
                      <td className="px-3 py-2">GW{wc.event}</td>
                      <td className="px-3 py-2 font-medium">{wc.captain_name}</td>
                      <td className="px-3 py-2 text-gray-600">{wc.team_short_name}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">
                        {wc.xp_that_week.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
