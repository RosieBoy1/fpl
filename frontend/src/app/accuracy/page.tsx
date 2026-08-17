"use client";

import { useState } from "react";
import Link from "next/link";
import {
  fetchAccuracy,
  snapshotPredictions,
  type AccuracyResult,
} from "@/lib/api";

export default function AccuracyPage() {
  const [event, setEvent] = useState(1);

  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [accuracy, setAccuracy] = useState<AccuracyResult | null>(null);
  const [accuracyLoading, setAccuracyLoading] = useState(false);
  const [accuracyError, setAccuracyError] = useState<string | null>(null);

  async function handleSnapshot() {
    setSnapshotLoading(true);
    setSnapshotStatus(null);
    try {
      const r = await snapshotPredictions(event);
      setSnapshotStatus(`Recorded predictions for ${r.players_snapshotted} players.`);
    } catch (e) {
      setSnapshotStatus(`Failed: ${String(e)}`);
    } finally {
      setSnapshotLoading(false);
    }
  }

  async function handleCheckAccuracy() {
    setAccuracyLoading(true);
    setAccuracyError(null);
    try {
      setAccuracy(await fetchAccuracy(event));
    } catch (e) {
      setAccuracyError(String(e));
    } finally {
      setAccuracyLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-blue-50 to-sky-50 p-6 text-slate-800">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-blue-100 border-b-4 border-b-amber-400 bg-white px-5 py-4 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Model Accuracy Tracking</h1>
            <p className="mt-1 text-sm text-slate-500">
              Snapshot xP predictions for a gameweek before it locks, then check how they
              compared to actual FPL points once that gameweek finishes. The 2026/27 season
              hasn&apos;t started yet, so no gameweek has finished — snapshotting works now,
              but the accuracy check will say so until GW1 finishes.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 text-sm font-medium text-blue-700 transition-colors hover:text-amber-600"
          >
            &larr; Dashboard
          </Link>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Gameweek
            <input
              type="number"
              min={1}
              max={38}
              value={event}
              onChange={(e) => setEvent(Number(e.target.value))}
              className="w-16 rounded-lg border border-blue-200 bg-white px-2 py-1 shadow-sm"
            />
          </label>
          <button
            onClick={handleSnapshot}
            disabled={snapshotLoading}
            className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:border-amber-300 disabled:opacity-50"
          >
            {snapshotLoading ? "Recording…" : "Snapshot predictions"}
          </button>
          <button
            onClick={handleCheckAccuracy}
            disabled={accuracyLoading}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {accuracyLoading ? "Checking…" : "Check accuracy"}
          </button>
        </div>

        {snapshotStatus && (
          <p className="mb-4 text-sm text-slate-600">{snapshotStatus}</p>
        )}

        {accuracyError && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {accuracyError}
          </div>
        )}

        {accuracy && !accuracy.finished && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {accuracy.message}
          </div>
        )}

        {accuracy && accuracy.finished && accuracy.predictions && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-blue-100 bg-white p-3 text-center shadow-sm">
                <div className="text-xs uppercase text-slate-500">Players</div>
                <div className="text-lg font-semibold text-slate-800">{accuracy.n_players}</div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-white p-3 text-center shadow-sm">
                <div className="text-xs uppercase text-slate-500">MAE</div>
                <div className="text-lg font-semibold text-slate-800">{accuracy.mae}</div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-white p-3 text-center shadow-sm">
                <div className="text-xs uppercase text-slate-500">RMSE</div>
                <div className="text-lg font-semibold text-slate-800">{accuracy.rmse}</div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-white p-3 text-center shadow-sm">
                <div className="text-xs uppercase text-slate-500">Correlation</div>
                <div className="text-lg font-semibold text-amber-700">{accuracy.correlation ?? "—"}</div>
              </div>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Bias {accuracy.bias! > 0 ? "+" : ""}
              {accuracy.bias}: {accuracy.bias! > 0 ? "model overpredicts" : "model underpredicts"}{" "}
              on average. Rows sorted by largest miss first.
            </p>

            <div className="overflow-x-auto rounded-xl border border-blue-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2 text-right">Predicted xP</th>
                    <th className="px-3 py-2 text-right">Actual pts</th>
                    <th className="px-3 py-2 text-right">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {accuracy.predictions.map((row) => (
                    <tr key={row.player_id} className="border-t border-blue-50">
                      <td className="px-3 py-2 font-medium">{row.web_name}</td>
                      <td className="px-3 py-2 text-right">{row.predicted_xp.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{row.actual_points}</td>
                      <td
                        className={`px-3 py-2 text-right ${
                          row.error > 0 ? "text-red-600" : "text-blue-600"
                        }`}
                      >
                        {row.error > 0 ? "+" : ""}
                        {row.error.toFixed(2)}
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
