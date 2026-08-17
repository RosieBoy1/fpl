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

export type TransferPair = { out: SquadPlayer; in: SquadPlayer };

export type TransferResult = OptimizeResult & {
  transfers: TransferPair[];
  n_transfers: number;
  hit_points: number;
  gross_xp: number;
  net_xp: number;
};

export async function fetchTransferSuggestions(
  squadIds: number[],
  freeTransfers: number,
  maxTransfers: number
): Promise<TransferResult> {
  const res = await fetch(`${API_URL}/optimize/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      squad_ids: squadIds,
      free_transfers: freeTransfers,
      max_transfers: maxTransfers,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to suggest transfers: ${res.status} ${body}`);
  }
  return res.json();
}

export type SavedSquadSummary = {
  id: number;
  name: string;
  player_ids: number[];
  created_at: string;
  updated_at: string;
};

export type SavedSquadDetail = SavedSquadSummary & {
  players: {
    id: number;
    web_name: string;
    team_id: number;
    team_short_name: string;
    position: "GKP" | "DEF" | "MID" | "FWD";
    cost_m: number;
  }[];
};

export async function saveSquad(name: string, playerIds: number[]): Promise<SavedSquadSummary> {
  const res = await fetch(`${API_URL}/squads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, player_ids: playerIds }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to save squad: ${res.status} ${body}`);
  }
  return res.json();
}

export async function fetchSavedSquads(): Promise<SavedSquadSummary[]> {
  const res = await fetch(`${API_URL}/squads`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch saved squads: ${res.status}`);
  return res.json();
}

export async function fetchSavedSquad(id: number): Promise<SavedSquadDetail> {
  const res = await fetch(`${API_URL}/squads/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch squad ${id}: ${res.status}`);
  return res.json();
}

export async function deleteSavedSquad(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/squads/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete squad ${id}: ${res.status}`);
}
