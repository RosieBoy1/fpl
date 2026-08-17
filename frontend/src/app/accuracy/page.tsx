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
    <div className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mx-auto max-w-4xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Model Accuracy Tracking</h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            &larr; Dashboard
          </Link>
        </div>
        <p className="mb-6 text-sm text-gray-500">
          Snapshot xP predictions for a gameweek before it locks, then check how they
          compared to actual FPL points once that gameweek finishes. The 2026/27 season
          hasn&apos;t started yet, so no gameweek has finished — snapshotting works now,
          but the accuracy check will say so until GW1 finishes.
        </p>

        <div className="mb-6 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Gameweek
            <input
              type="number"
              min={1}
              max={38}
              value={event}
              onChange={(e) => setEvent(Number(e.target.value))}
              className="w-16 rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <button
            onClick={handleSnapshot}
            disabled={snapshotLoading}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {snapshotLoading ? "Recording…" : "Snapshot predictions"}
          </button>
          <button
            onClick={handleCheckAccuracy}
            disabled={accuracyLoading}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {accuracyLoading ? "Checking…" : "Check accuracy"}
          </button>
        </div>

        {snapshotStatus && (
          <p className="mb-4 text-sm text-gray-600">{snapshotStatus}</p>
        )}

        {accuracyError && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {accuracyError}
          </div>
        )}

        {accuracy && !accuracy.finished && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {accuracy.message}
          </div>
        )}

        {accuracy && accuracy.finished && accuracy.predictions && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded border border-gray-200 bg-white p-3 text-center">
                <div className="text-xs uppercase text-gray-500">Players</div>
                <div className="text-lg font-semibold">{accuracy.n_players}</div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3 text-center">
                <div className="text-xs uppercase text-gray-500">MAE</div>
                <div className="text-lg font-semibold">{accuracy.mae}</div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3 text-center">
                <div className="text-xs uppercase text-gray-500">RMSE</div>
                <div className="text-lg font-semibold">{accuracy.rmse}</div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3 text-center">
                <div className="text-xs uppercase text-gray-500">Correlation</div>
                <div className="text-lg font-semibold">{accuracy.correlation ?? "—"}</div>
              </div>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              Bias {accuracy.bias! > 0 ? "+" : ""}
              {accuracy.bias}: {accuracy.bias! > 0 ? "model overpredicts" : "model underpredicts"}{" "}
              on average. Rows sorted by largest miss first.
            </p>

            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2 text-right">Predicted xP</th>
                    <th className="px-3 py-2 text-right">Actual pts</th>
                    <th className="px-3 py-2 text-right">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {accuracy.predictions.map((row) => (
                    <tr key={row.player_id} className="border-t border-gray-100">
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
