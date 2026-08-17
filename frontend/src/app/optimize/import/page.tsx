"use client";

import { useState } from "react";
import Link from "next/link";
import {
  fetchTransferSuggestions,
  importTeam,
  type Chip,
  type ImportedTeam,
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
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      {CHIP_LABELS[chip]} active
    </span>
  );
}

export default function ImportPage() {
  const [entryId, setEntryId] = useState("");
  const [team, setTeam] = useState<ImportedTeam | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [freeTransfers, setFreeTransfers] = useState(1);
  const [maxTransfers, setMaxTransfers] = useState(2);
  const [chip, setChip] = useState<"" | Chip>("");
  const [transferResult, setTransferResult] = useState<TransferResult | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  async function handleImport() {
    const id = Number(entryId);
    if (!id) return;
    setLoading(true);
    setError(null);
    setTeam(null);
    setTransferResult(null);
    try {
      setTeam(await importTeam(id));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function suggestTransfers() {
    if (!team) return;
    setTransferLoading(true);
    setTransferError(null);
    try {
      setTransferResult(
        await fetchTransferSuggestions(
          team.squad_ids,
          freeTransfers,
          maxTransfers,
          chip || undefined,
          team.total_budget_m
        )
      );
    } catch (e) {
      setTransferError(String(e));
    } finally {
      setTransferLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-blue-50 to-sky-50 p-6 text-slate-800">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-blue-100 border-b-4 border-b-amber-400 bg-white px-5 py-4 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Import My Team</h1>
            <p className="mt-1 text-sm text-slate-500">
              Pull your real current FPL squad and bank balance by team ID, then get transfer
              recommendations against your actual total budget (squad value + bank) — not just
              a squad&apos;s own cost. Find your team ID in the FPL site URL, e.g.
              fantasy.premierleague.com/entry/<strong>1234567</strong>/event/1. Only works once
              a gameweek&apos;s picks have been published (after its transfer deadline passes) —
              won&apos;t work before the season starts.
            </p>
          </div>
          <Link
            href="/optimize"
            className="shrink-0 text-sm font-medium text-blue-700 transition-colors hover:text-amber-600"
          >
            &larr; Squad optimizer
          </Link>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <input
            type="number"
            placeholder="FPL Team ID"
            value={entryId}
            onChange={(e) => setEntryId(e.target.value)}
            className="w-40 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-amber-400 focus:outline-none"
          />
          <button
            onClick={handleImport}
            disabled={loading || !entryId.trim()}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {loading ? "Importing…" : "Import my team"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {team && (
          <>
            <div className="mb-6 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800">
                {team.entry_name}{" "}
                <span className="text-sm font-normal text-slate-500">
                  ({team.manager_name})
                </span>
              </h2>
              <div className="mt-2 flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-slate-500">Gameweek: </span>
                  <span className="font-medium">GW{team.event}</span>
                </div>
                <div>
                  <span className="text-slate-500">Squad value: </span>
                  <span className="font-medium">£{team.squad_value_m.toFixed(1)}m</span>
                </div>
                <div>
                  <span className="text-slate-500">In the bank: </span>
                  <span className="font-medium">£{team.bank_m.toFixed(1)}m</span>
                </div>
                <div>
                  <span className="text-slate-500">Total budget: </span>
                  <span className="font-semibold text-amber-700">
                    £{team.total_budget_m.toFixed(1)}m
                  </span>
                </div>
              </div>
            </div>

            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Your squad</h2>
            <div className="mb-6 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              {POSITION_ORDER.map((pos) => {
                const players = team.players.filter((p) => p.position === pos);
                if (players.length === 0) return null;
                return (
                  <div key={pos} className="flex flex-wrap justify-center gap-2">
                    {players.map((p) => (
                      <div
                        key={p.id}
                        className="flex min-w-[110px] flex-col items-center rounded-lg border border-blue-100 bg-white px-2 py-2 text-center shadow-sm"
                      >
                        <div className="text-sm font-medium text-slate-800">
                          {p.web_name}
                          {p.id === team.captain_id && (
                            <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                              C
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{p.team_short_name}</div>
                        <div className="text-xs text-slate-400">£{p.cost_m.toFixed(1)}m</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold uppercase text-slate-500">
                Suggest transfers
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                Uses your real total budget (£{team.total_budget_m.toFixed(1)}m — squad value +
                bank), not just your squad&apos;s own cost.
              </p>

              <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  Free transfers
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={freeTransfers}
                    disabled={chip === "wildcard" || chip === "free_hit"}
                    onChange={(e) => setFreeTransfers(Number(e.target.value))}
                    className="w-16 rounded-lg border border-blue-200 px-2 py-1 disabled:bg-blue-50"
                  />
                </label>
                <label className="flex items-center gap-2">
                  Max transfers to consider
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={maxTransfers}
                    disabled={chip === "wildcard" || chip === "free_hit"}
                    onChange={(e) => setMaxTransfers(Number(e.target.value))}
                    className="w-16 rounded-lg border border-blue-200 px-2 py-1 disabled:bg-blue-50"
                  />
                </label>
                <label className="flex items-center gap-2">
                  Chip
                  <select
                    value={chip}
                    onChange={(e) => setChip(e.target.value as typeof chip)}
                    className="rounded-lg border border-blue-200 px-2 py-1.5"
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
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-400 disabled:opacity-50"
                >
                  {transferLoading ? "Solving…" : "Suggest transfers"}
                </button>
              </div>

              {transferError && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  Couldn&apos;t suggest transfers: {transferError}
                </div>
              )}

              {transferResult && (
                <div className="text-sm">
                  <div className="mb-3 flex flex-wrap items-center gap-6">
                    <div>
                      <span className="text-slate-500">Transfers: </span>
                      <span className="font-semibold text-slate-800">
                        {transferResult.n_transfers}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Hit: </span>
                      <span className="font-semibold text-red-600">
                        {transferResult.hit_points > 0 ? `-${transferResult.hit_points}` : "0"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Net xP (GW): </span>
                      <span className="font-semibold text-amber-700">
                        {transferResult.net_xp.toFixed(2)}
                      </span>
                    </div>
                    <ChipBadge chip={transferResult.chip} />
                  </div>

                  {transferResult.transfers.length === 0 ? (
                    <p className="text-slate-500">
                      No transfer clears the hit cost — your squad is already optimal within
                      the given free-transfer allowance.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {transferResult.transfers.map((t, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-lg border border-blue-100 p-2"
                        >
                          <span className="rounded-md bg-red-100 px-2 py-1 text-red-700">
                            OUT: {t.out.web_name} ({t.out.xp.toFixed(2)} xP)
                          </span>
                          <span className="text-slate-400">&rarr;</span>
                          <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-800">
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
