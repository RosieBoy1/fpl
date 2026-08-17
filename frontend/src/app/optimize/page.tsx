"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  deleteSavedSquad,
  fetchOptimalSquad,
  fetchSavedSquad,
  fetchSavedSquads,
  fetchTransferSuggestions,
  saveSquad,
  type Chip,
  type OptimizeResult,
  type SavedSquadSummary,
  type SquadPlayer,
  type TransferResult,
} from "@/lib/api";

const POSITION_ORDER = ["GKP", "DEF", "MID", "FWD"] as const;

const CHIP_LABELS: Record<Chip, string> = {
  wildcard: "Wildcard",
  free_hit: "Free Hit",
  triple_captain: "Triple Captain",
  bench_boost: "Bench Boost",
};

function ChipBadge({ chip }: { chip: Chip | null | undefined }) {
  if (!chip) return null;
  return (
    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
      {CHIP_LABELS[chip]} active
    </span>
  );
}

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

type ActiveSquad = { ids: number[]; label: string };

export default function OptimizePage() {
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildChip, setBuildChip] = useState<"" | "triple_captain" | "bench_boost">("");

  const [activeSquad, setActiveSquad] = useState<ActiveSquad | null>(null);

  const [freeTransfers, setFreeTransfers] = useState(1);
  const [maxTransfers, setMaxTransfers] = useState(2);
  const [transferChip, setTransferChip] = useState<"" | Chip>("");
  const [transferResult, setTransferResult] = useState<TransferResult | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [savedSquads, setSavedSquads] = useState<SavedSquadSummary[]>([]);
  const [squadName, setSquadName] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [savedSquadsError, setSavedSquadsError] = useState<string | null>(null);

  async function refreshSavedSquads() {
    try {
      setSavedSquads(await fetchSavedSquads());
      setSavedSquadsError(null);
    } catch (e) {
      setSavedSquadsError(String(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchSavedSquads()
      .then((squads) => {
        if (!cancelled) {
          setSavedSquads(squads);
          setSavedSquadsError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setSavedSquadsError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    setTransferResult(null);
    try {
      const r = await fetchOptimalSquad(buildChip || undefined);
      setResult(r);
      setActiveSquad({ ids: r.squad.map((p) => p.id), label: "Just-built optimal squad" });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSquad() {
    if (!result || !squadName.trim()) return;
    setSaveStatus("Saving…");
    try {
      await saveSquad(
        squadName.trim(),
        result.squad.map((p) => p.id)
      );
      setSquadName("");
      setSaveStatus("Saved.");
      await refreshSavedSquads();
    } catch (e) {
      setSaveStatus(`Failed: ${String(e)}`);
    }
  }

  async function loadSavedSquad(id: number) {
    const squad = await fetchSavedSquad(id);
    setActiveSquad({ ids: squad.player_ids, label: `Saved squad: ${squad.name}` });
    setTransferResult(null);
  }

  async function handleDeleteSquad(id: number) {
    await deleteSavedSquad(id);
    await refreshSavedSquads();
  }

  async function suggestTransfers() {
    if (!activeSquad) return;
    setTransferLoading(true);
    setTransferError(null);
    try {
      setTransferResult(
        await fetchTransferSuggestions(
          activeSquad.ids,
          freeTransfers,
          maxTransfers,
          transferChip || undefined
        )
      );
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
          <div className="flex gap-4">
            <Link href="/optimize/horizon" className="text-sm text-blue-600 hover:underline">
              Multi-gameweek horizon &rarr;
            </Link>
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              &larr; Dashboard
            </Link>
          </div>
        </div>
        <p className="mb-6 text-sm text-gray-500">
          Best possible 15-man squad, starting XI, and captain for the upcoming gameweek —
          £100.0m budget, 2/5/5/3 squad, max 3 per team, valid formation (v1: single gameweek,
          built from scratch via linear programming).
        </p>

        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={run}
            disabled={loading}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Solving…" : "Build optimal squad"}
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Chip
            <select
              value={buildChip}
              onChange={(e) => setBuildChip(e.target.value as typeof buildChip)}
              className="rounded border border-gray-300 px-2 py-1.5"
            >
              <option value="">None</option>
              <option value="triple_captain">Triple Captain</option>
              <option value="bench_boost">Bench Boost</option>
            </select>
          </label>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Couldn&apos;t optimize: {error}
          </div>
        )}

        {result && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-6 text-sm">
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
              <ChipBadge chip={result.chip} />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Squad name"
                  value={squadName}
                  onChange={(e) => setSquadName(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={handleSaveSquad}
                  disabled={!squadName.trim()}
                  className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium disabled:opacity-50"
                >
                  Save this squad
                </button>
                {saveStatus && <span className="text-xs text-gray-500">{saveStatus}</span>}
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
          </>
        )}

        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase text-gray-500">My saved squads</h2>
          {savedSquadsError && (
            <p className="mb-2 text-sm text-red-600">Couldn&apos;t load: {savedSquadsError}</p>
          )}
          {savedSquads.length === 0 ? (
            <p className="text-sm text-gray-500">
              No saved squads yet — build a squad above and save it to reuse across sessions.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {savedSquads.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded border border-gray-200 p-2 text-sm"
                >
                  <span>
                    {s.name}{" "}
                    <span className="text-xs text-gray-400">
                      ({new Date(s.updated_at).toLocaleDateString()})
                    </span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadSavedSquad(s.id)}
                      className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white"
                    >
                      Use for transfers
                    </button>
                    <button
                      onClick={() => handleDeleteSquad(s.id)}
                      className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeSquad && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold uppercase text-gray-500">
              Suggest transfers (v2)
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              Active squad: <span className="font-medium">{activeSquad.label}</span>. Looks for
              the highest-value 1-2 transfers within its own budget — free transfers cost
              nothing, extra ones cost -4pts, weighed against the xP gained.
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                Free transfers
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={freeTransfers}
                  disabled={transferChip === "wildcard" || transferChip === "free_hit"}
                  onChange={(e) => setFreeTransfers(Number(e.target.value))}
                  className="w-16 rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                />
              </label>
              <label className="flex items-center gap-2">
                Max transfers to consider
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={maxTransfers}
                  disabled={transferChip === "wildcard" || transferChip === "free_hit"}
                  onChange={(e) => setMaxTransfers(Number(e.target.value))}
                  className="w-16 rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                />
              </label>
              <label className="flex items-center gap-2">
                Chip
                <select
                  value={transferChip}
                  onChange={(e) => setTransferChip(e.target.value as typeof transferChip)}
                  className="rounded border border-gray-300 px-2 py-1.5"
                >
                  <option value="">None</option>
                  <option value="wildcard">Wildcard (rebuild, persists)</option>
                  <option value="free_hit">Free Hit (rebuild, reverts next GW)</option>
                  <option value="triple_captain">Triple Captain</option>
                  <option value="bench_boost">Bench Boost</option>
                </select>
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
                <div className="mb-3 flex flex-wrap items-center gap-6">
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
                  <ChipBadge chip={transferResult.chip} />
                </div>
                {(transferResult.chip === "wildcard" || transferResult.chip === "free_hit") && (
                  <p className="mb-3 text-xs text-gray-500">
                    {transferResult.chip === "wildcard"
                      ? "This squad persists — save it below to keep using it in future gameweeks."
                      : "This squad is only for this gameweek — your previous squad is still your real one after this. Don't save over it unless you mean to."}
                  </p>
                )}

                {transferResult.transfers.length === 0 ? (
                  <p className="text-gray-500">
                    No transfer clears the hit cost — this squad is already optimal within the
                    given free-transfer allowance.
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
        )}
      </div>
    </div>
  );
}
