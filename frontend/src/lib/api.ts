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

export type Chip = "wildcard" | "free_hit" | "triple_captain" | "bench_boost";

export type OptimizeResult = {
  squad: SquadPlayer[];
  starting_xi: SquadPlayer[];
  bench: SquadPlayer[];
  captain: SquadPlayer;
  total_cost_m: number;
  total_xp: number;
  chip: Chip | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchPlayers(): Promise<PlayerRow[]> {
  const res = await fetch(`${API_URL}/players`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch players: ${res.status}`);
  }
  return res.json();
}

export async function fetchOptimalSquad(
  chip?: Extract<Chip, "triple_captain" | "bench_boost">
): Promise<OptimizeResult> {
  const params = new URLSearchParams();
  if (chip === "triple_captain") params.set("triple_captain", "true");
  if (chip === "bench_boost") params.set("bench_boost", "true");
  const qs = params.toString();
  const res = await fetch(`${API_URL}/optimize${qs ? `?${qs}` : ""}`, { cache: "no-store" });
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
  maxTransfers: number,
  chip?: Chip,
  budgetM?: number
): Promise<TransferResult> {
  const res = await fetch(`${API_URL}/optimize/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      squad_ids: squadIds,
      free_transfers: freeTransfers,
      max_transfers: maxTransfers,
      chip: chip ?? null,
      budget_m: budgetM ?? null,
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

export type HorizonSquadPlayer = {
  id: number;
  web_name: string;
  team_id: number;
  team_short_name: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  cost_m: number;
  xp_total: number;
};

export type WeeklyCaptain = {
  event: number;
  captain_id: number;
  captain_name: string;
  team_short_name: string;
  xp_that_week: number;
};

export type HorizonResult = {
  events: number[];
  squad: HorizonSquadPlayer[];
  starting_xi: HorizonSquadPlayer[];
  bench: HorizonSquadPlayer[];
  total_cost_m: number;
  weekly_captains: WeeklyCaptain[];
  total_horizon_xp: number;
};

export async function fetchHorizonSquad(weeks: number): Promise<HorizonResult> {
  const res = await fetch(`${API_URL}/optimize/horizon?weeks=${weeks}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to build horizon squad: ${res.status} ${body}`);
  }
  return res.json();
}

export type SnapshotResult = { event: number; players_snapshotted: number };

export async function snapshotPredictions(event: number): Promise<SnapshotResult> {
  const res = await fetch(`${API_URL}/predictions/snapshot?event=${event}`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to snapshot predictions: ${res.status} ${body}`);
  }
  return res.json();
}

export type AccuracyRow = {
  player_id: number;
  web_name: string;
  predicted_xp: number;
  actual_points: number;
  error: number;
};

export type AccuracyResult = {
  event: number;
  finished: boolean;
  message?: string;
  n_players?: number;
  mae?: number;
  rmse?: number;
  bias?: number;
  correlation?: number | null;
  predictions?: AccuracyRow[];
};

export async function fetchAccuracy(event: number): Promise<AccuracyResult> {
  const res = await fetch(`${API_URL}/predictions/accuracy?event=${event}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch accuracy: ${res.status} ${body}`);
  }
  return res.json();
}

export type ImportedPlayer = {
  id: number;
  web_name: string;
  team_id: number;
  team_short_name: string;
  position: "GKP" | "DEF" | "MID" | "FWD";
  cost_m: number;
};

export type ImportedTeam = {
  entry_id: number;
  entry_name: string;
  manager_name: string;
  event: number;
  squad_ids: number[];
  captain_id: number | null;
  bank_m: number;
  squad_value_m: number;
  total_budget_m: number;
  players: ImportedPlayer[];
};

export async function importTeam(entryId: number): Promise<ImportedTeam> {
  const res = await fetch(`${API_URL}/import/${entryId}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Failed to import team: ${res.status}`);
  }
  return res.json();
}
