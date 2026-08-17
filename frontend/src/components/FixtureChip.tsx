import type { FixtureDifficulty } from "@/lib/api";

const DIFFICULTY_COLORS: Record<number, string> = {
  1: "bg-emerald-500 text-white",
  2: "bg-emerald-300 text-emerald-950",
  3: "bg-amber-300 text-amber-950",
  4: "bg-orange-400 text-orange-950",
  5: "bg-red-500 text-white",
};

export function FixtureChip({ fixture }: { fixture: FixtureDifficulty }) {
  return (
    <span
      title={`xGF ${fixture.expected_goals_for} / xGA ${fixture.expected_goals_against} — CS ${(fixture.clean_sheet_probability * 100).toFixed(0)}%`}
      className={`inline-block w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-medium ${DIFFICULTY_COLORS[fixture.difficulty] ?? "bg-gray-300"}`}
    >
      {fixture.opponent_short_name}
      {fixture.is_home ? "" : " (A)"}
    </span>
  );
}
