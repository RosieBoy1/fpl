"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchOptimalSquad, type OptimizeResult, type SquadPlayer } from "@/lib/api";

const POSITION_ORDER = ["GKP", "DEF", "MID", "FWD"] as const;

function PlayerCard({ player, isCaptain }: { player: SquadPlayer; isCaptain: boolean }) {
  return (
    <div className="flex min-w-[110px] flex-col items-center rounded border border-gray-200 bg-white px-2 py-2 text-center shadow-sm">
      <div className="text-sm font-medium">
        {player.web_name}
        {isCaptain && (
          <span className="ml-1 rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
            C
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500">{player.team_short_name}</div>
      <div className="text-xs text-gray-400">£{player.cost_m.toFixed(1)}m</div>
      <div className="text-xs font-semibold text-emerald-700">{player.xp.toFixed(2)} xP</div>
    </div>
  );
}

export default function OptimizePage() {
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchOptimalSquad());
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
          <h1 className="text-2xl font-bold">Squad Optimizer</h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            &larr; Dashboard
          </Link>
        </div>
        <p className="mb-6 text-sm text-gray-500">
          Best possible 15-man squad, starting XI, and captain for the upcoming gameweek —
          £100.0m budget, 2/5/5/3 squad, max 3 per team, valid formation (v1: single gameweek,
          built from scratch via linear programming).
        </p>

        <button
          onClick={run}
          disabled={loading}
          className="mb-6 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Solving…" : "Build optimal squad"}
        </button>

        {error && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Couldn&apos;t optimize: {error}
          </div>
        )}

        {result && (
          <>
            <div className="mb-6 flex gap-6 text-sm">
              <div>
                <span className="text-gray-500">Total cost: </span>
                <span className="font-semibold">£{result.total_cost_m.toFixed(1)}m</span>
              </div>
              <div>
                <span className="text-gray-500">Expected points (GW, with captaincy): </span>
                <span className="font-semibold text-emerald-700">
                  {result.total_xp.toFixed(2)}
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
                      <PlayerCard
                        key={p.id}
                        player={p}
                        isCaptain={p.id === result.captain.id}
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">Bench</h2>
            <div className="flex flex-wrap gap-2">
              {result.bench.map((p) => (
                <PlayerCard key={p.id} player={p} isCaptain={false} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
