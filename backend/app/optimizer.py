"""Squad optimizer v1/v2, per MODEL_SPEC.md section 3.

v1 scope: single-gameweek squad selection from scratch — build the best possible
15-man squad, starting XI, and captain for the upcoming gameweek.

v2 scope: given an existing squad, suggest the highest-value 1-2 transfers,
allowing a -4pt "hit" per transfer beyond the free ones rather than a hard cap
(the solver decides whether a hit-taking transfer is still worth it).

Multi-gameweek horizon (v3) is out of scope here.
"""
from __future__ import annotations

import pulp

BUDGET_M = 100.0
SQUAD_SIZE = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}
MAX_PER_TEAM = 3
FORMATION_MIN = {"GKP": 1, "DEF": 3, "MID": 2, "FWD": 1}
FORMATION_MAX = {"GKP": 1, "DEF": 5, "MID": 5, "FWD": 3}
HIT_PENALTY_PER_TRANSFER = 4


class OptimizerInput:
    __slots__ = ("id", "web_name", "team_id", "position", "cost_m", "xp")

    def __init__(self, id: int, web_name: str, team_id: int, position: str, cost_m: float, xp: float):
        self.id = id
        self.web_name = web_name
        self.team_id = team_id
        self.position = position
        self.cost_m = cost_m
        self.xp = xp


def _pick_solver():
    """PuLP's bundled CBC binary is x86_64-only for macOS and this machine is
    Apple Silicon with no Rosetta installed, so CBC's subprocess call fails
    with "Bad CPU type in executable". HiGHS (via the highspy Python bindings,
    no subprocess/external binary involved) has a native arm64 wheel and works
    everywhere CBC does, so prefer it when available and fall back to CBC
    (e.g. on Render's Linux hosts, where the bundled CBC binary works fine)."""
    for solver in (pulp.HiGHS(msg=False), pulp.PULP_CBC_CMD(msg=False)):
        if solver.available():
            return solver
    raise RuntimeError("No usable PuLP solver found (tried HiGHS, CBC)")


def optimize_squad(
    players: list[OptimizerInput],
    existing_squad_ids: set[int] | None = None,
    free_transfers: int = 1,
    max_transfers: int = 2,
) -> dict:
    """Build the best squad/XI/captain. With existing_squad_ids, instead optimizes
    around that squad: budget is capped at the existing squad's value (not the full
    £100m — you're reinvesting sold players' cost, not starting fresh), the number
    of players swapped is capped at max_transfers, and each transfer beyond
    free_transfers costs a -4pt hit that the solver weighs against the xP gain."""
    prob = pulp.LpProblem("fpl_squad", pulp.LpMaximize)

    squad = {p.id: pulp.LpVariable(f"squad_{p.id}", cat="Binary") for p in players}
    start = {p.id: pulp.LpVariable(f"start_{p.id}", cat="Binary") for p in players}
    captain = {p.id: pulp.LpVariable(f"cap_{p.id}", cat="Binary") for p in players}

    by_id = {p.id: p for p in players}

    # Objective: starting XI's xP, plus the captain's xP counted again (doubled total).
    objective = pulp.lpSum(by_id[i].xp * start[i] for i in start) + pulp.lpSum(
        by_id[i].xp * captain[i] for i in captain
    )

    # Squad composition
    prob += pulp.lpSum(squad.values()) == 15
    for pos, n in SQUAD_SIZE.items():
        prob += pulp.lpSum(squad[p.id] for p in players if p.position == pos) == n

    # Budget: existing squad's own value if transferring, full budget if building from scratch
    budget = BUDGET_M
    if existing_squad_ids:
        budget = sum(by_id[i].cost_m for i in existing_squad_ids if i in by_id)
    prob += pulp.lpSum(by_id[i].cost_m * squad[i] for i in squad) <= budget

    # Max 3 per real team
    team_ids = {p.team_id for p in players}
    for t in team_ids:
        prob += pulp.lpSum(squad[p.id] for p in players if p.team_id == t) <= MAX_PER_TEAM

    # Starting XI drawn from the squad
    prob += pulp.lpSum(start.values()) == 11
    for i in squad:
        prob += start[i] <= squad[i]

    for pos in FORMATION_MIN:
        ids_at_pos = [p.id for p in players if p.position == pos]
        prob += pulp.lpSum(start[i] for i in ids_at_pos) >= FORMATION_MIN[pos]
        prob += pulp.lpSum(start[i] for i in ids_at_pos) <= FORMATION_MAX[pos]

    # Exactly one captain, chosen from the starting XI
    prob += pulp.lpSum(captain.values()) == 1
    for i in captain:
        prob += captain[i] <= start[i]

    if existing_squad_ids:
        kept_ids = [i for i in existing_squad_ids if i in squad]
        kept_count = pulp.lpSum(squad[i] for i in kept_ids)
        transfers_made = len(kept_ids) - kept_count
        prob += transfers_made <= max_transfers

        extra_transfers = pulp.LpVariable("extra_transfers", lowBound=0, cat="Integer")
        prob += extra_transfers >= transfers_made - free_transfers
        objective -= HIT_PENALTY_PER_TRANSFER * extra_transfers

    prob += objective

    status = prob.solve(_pick_solver())

    if pulp.LpStatus[status] != "Optimal":
        raise RuntimeError(f"Optimizer did not find an optimal solution: {pulp.LpStatus[status]}")

    # Solvers (HiGHS in particular) can return binary values like 0.9999999999999997
    # or 1.000000000000001 rather than exact 1.0, so an exact `== 1` filter silently
    # drops valid squad members. Use a tolerance instead.
    squad_ids = [i for i in squad if squad[i].value() > 0.5]
    starting_ids = [i for i in start if start[i].value() > 0.5]
    captain_id = next(i for i in captain if captain[i].value() > 0.5)
    bench_ids = [i for i in squad_ids if i not in starting_ids]

    total_cost = sum(by_id[i].cost_m for i in squad_ids)

    def summarize(i):
        p = by_id[i]
        return {
            "id": p.id,
            "web_name": p.web_name,
            "team_id": p.team_id,
            "position": p.position,
            "cost_m": p.cost_m,
            "xp": p.xp,
        }

    result = {
        "squad": [summarize(i) for i in squad_ids],
        "starting_xi": [summarize(i) for i in starting_ids],
        "bench": [summarize(i) for i in bench_ids],
        "captain": summarize(captain_id),
        "total_cost_m": round(total_cost, 1),
    }

    if existing_squad_ids:
        players_out = [i for i in existing_squad_ids if i in by_id and i not in squad_ids]
        players_in = [i for i in squad_ids if i not in existing_squad_ids]
        n_transfers = len(players_in)
        hit_points = HIT_PENALTY_PER_TRANSFER * max(0, n_transfers - free_transfers)
        gross_xp = pulp.value(objective) + hit_points  # objective already has the hit subtracted
        result["transfers"] = _pair_transfers(players_out, players_in, by_id)
        result["n_transfers"] = n_transfers
        result["hit_points"] = hit_points
        result["gross_xp"] = round(gross_xp, 2)
        result["net_xp"] = round(gross_xp - hit_points, 2)
    else:
        result["total_xp"] = round(pulp.value(objective), 2)

    return result


def _pair_transfers(
    players_out: list[int], players_in: list[int], by_id: dict[int, OptimizerInput]
) -> list[dict]:
    """Pair outgoing/incoming players by position for display. Squad position
    quotas are fixed exactly, so the two lists always balance per position."""
    out_by_pos: dict[str, list[int]] = {}
    in_by_pos: dict[str, list[int]] = {}
    for i in players_out:
        out_by_pos.setdefault(by_id[i].position, []).append(i)
    for i in players_in:
        in_by_pos.setdefault(by_id[i].position, []).append(i)

    def summarize(i):
        p = by_id[i]
        return {
            "id": p.id,
            "web_name": p.web_name,
            "team_id": p.team_id,
            "position": p.position,
            "cost_m": p.cost_m,
            "xp": p.xp,
        }

    pairs = []
    for pos, out_ids in out_by_pos.items():
        for out_id, in_id in zip(out_ids, in_by_pos.get(pos, [])):
            pairs.append({"out": summarize(out_id), "in": summarize(in_id)})
    return pairs
