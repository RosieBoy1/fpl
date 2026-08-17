"use client";

import { useState } from "react";
import Link from "next/link";
import {
  fetchOptimalSquad,
  fetchTransferSuggestions,
  type OptimizeResult,
  type SquadPlayer,
  type TransferResult,
} from "@/lib/api";

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

  const [freeTransfers, setFreeTransfers] = useState(1);
  const [maxTransfers, setMaxTransfers] = useState(2);
  const [transferResult, setTransferResult] = useState<TransferResult | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setTransferResult(null);
    try {
      setResult(await fetchOptimalSquad());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function suggestTransfers() {
    if (!result) return;
    setTransferLoading(true);
    setTransferError(null);
    try {
      const squadIds = result.squad.map((p) => p.id);
      setTransferResult(await fetchTransferSuggestions(squadIds, freeTransfers, maxTransfers));
    } catch (e) {
      setTransferError(String(e));
    } finally {
      setTransferLoading(false);
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
            <div className="mb-8 flex flex-wrap gap-2">
              {result.bench.map((p) => (
                <PlayerCard key={p.id} player={p} isCaptain={false} />
              ))}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="mb-1 text-sm font-semibold uppercase text-gray-500">
                Suggest transfers (v2)
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                Treats the squad above as your current squad and looks for the highest-value
                1-2 transfers within its own budget — free transfers cost nothing, extra ones
                cost -4pts, weighed against the xP gained.
              </p>

              <div className="mb-3 flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  Free transfers
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={freeTransfers}
                    onChange={(e) => setFreeTransfers(Number(e.target.value))}
                    className="w-16 rounded border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-2">
                  Max transfers to consider
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={maxTransfers}
                    onChange={(e) => setMaxTransfers(Number(e.target.value))}
                    className="w-16 rounded border border-gray-300 px-2 py-1"
                  />
                </label>
                <button
                  onClick={suggestTransfers}
                  disabled={transferLoading}
                  className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {transferLoading ? "Solving…" : "Suggest transfers"}
                </button>
              </div>

              {transferError && (
                <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  Couldn&apos;t suggest transfers: {transferError}
                </div>
              )}

              {transferResult && (
                <div className="text-sm">
                  <div className="mb-3 flex gap-6">
                    <div>
                      <span className="text-gray-500">Transfers: </span>
                      <span className="font-semibold">{transferResult.n_transfers}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Hit: </span>
                      <span className="font-semibold text-red-600">
                        {transferResult.hit_points > 0 ? `-${transferResult.hit_points}` : "0"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Net xP (GW): </span>
                      <span className="font-semibold text-emerald-700">
                        {transferResult.net_xp.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {transferResult.transfers.length === 0 ? (
                    <p className="text-gray-500">
                      No transfer clears the hit cost — this squad is already optimal within
                      the given free-transfer allowance.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {transferResult.transfers.map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded border border-gray-200 p-2"
                        >
                          <span className="rounded bg-red-100 px-2 py-1 text-red-700">
                            OUT: {t.out.web_name} ({t.out.xp.toFixed(2)} xP)
                          </span>
                          <span className="text-gray-400">&rarr;</span>
                          <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">
                            IN: {t.in.web_name} ({t.in.xp.toFixed(2)} xP)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
