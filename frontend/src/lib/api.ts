export type FixtureDifficulty = {
  event: number | null;
  opponent_id: number;
  opponent_short_name: string;
  is_home: boolean;
  kickoff_time: string | null;
  expected_goals_for: number;
  expected_goals_against: number;
  clean_sheet_probability: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  xp: number;
};

export type PlayerRow = {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team_id: number;
  team_short_name: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  now_cost_m: number;
  form: number;
  total_points: number;
  points_per_game: number;
  selected_by_percent: number;
  status: string;
  news: string;
  xp_next_n: number;
  next_fixtures: FixtureDifficulty[];
};

export type SquadPlayer = {
  id: number;
  web_name: string;
  team_id: number;
  team_short_name: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  cost_m: number;
  xp: number;
};

export type OptimizeResult = {
  squad: SquadPlayer[];
  starting_xi: SquadPlayer[];
  bench: SquadPlayer[];
  captain: SquadPlayer;
  total_cost_m: number;
  total_xp: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchPlayers(): Promise<PlayerRow[]> {
  const res = await fetch(`${API_URL}/players`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch players: ${res.status}`);
  }
  return res.json();
}

export async function fetchOptimalSquad(): Promise<OptimizeResult> {
  const res = await fetch(`${API_URL}/optimize`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to optimize squad: ${res.status}`);
  }
  return res.json();
}
