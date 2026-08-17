# xP Model & Optimizer Spec

Supplement to PROJECT_BRIEF.md — gives Claude Code the actual football logic instead of leaving it to infer scoring rules.

## 1. Expected Points (xP) formula, per player per gameweek

```
xP = P(plays 60+ mins) * [
        appearance_pts
      + xG90 * goal_pts(position)
      + xA90 * 3
      + P(clean_sheet) * cs_pts(position)
      + P(defcon_threshold_met) * 2
      + expected_bonus
     ]
   - P(plays 1-59 mins) * (appearance_pts=1, no attacking/defensive credit)
   - expected_card_penalty
   - (GK/DEF only) expected_goals_conceded_penalty
```

**Position-based points (2026/27 rules):**

| Position | Goal | Clean sheet | DefCon threshold |
|---|---|---|---|
| GK | 6 | 4 | n/a (saves-based instead) |
| DEF | 6 | 4 | 10 CBIT actions/match → +2 |
| MID | 5 | 1 | 12 CBIRT actions/match → +2 |
| FWD | 4 | 0 | 12 CBIRT actions/match → +2 |

- `xG90`, `xA90`: rolling average over last 6 gameweeks (recent form matters more than season-long average), sourced from Understat, weighted 70/30 against season-long average to smooth small-sample noise.
- `P(plays 60+ mins)`: derived from minutes in each of the last 5 gameweeks — simple heuristic (started 4+ of last 5 → ~0.85, rotation risk → scale down) is fine for v1; don't over-engineer this.
- `P(defcon_threshold_met)`: rolling rate of games where the player hit the CBIT/CBIRT threshold, from historical per-90 tackle/interception/clearance/block/recovery data (this stat isn't in the official FPL API — needs to come from a source with match event data, e.g. FBref or Understat's supplementary stats. Flag this as a data-sourcing task, not just a formula).
- `expected_bonus`: historical average bonus points per 90 for that player, scaled by `P(plays 60+ mins)`.
- `expected_card_penalty`: cards per 90 * (-1 for yellow, -3 for red), from recent history.

## 2. Fixture difficulty (replaces FPL's built-in FDR)

Don't use FPL's 1-5 FDR — it's static and coarse. Instead:

1. Maintain two rolling ratings per team: **attack rating** and **defense rating** (Elo-style, start all teams at 1500, update after each gameweek based on actual goals scored vs. expected given opponent strength — standard football Elo update, k-factor ~20).
2. For a given fixture, estimate expected goals for/against using both teams' ratings + home/away adjustment (home advantage ~+0.2 expected goals, well-established in football analytics).
3. Convert expected goals against into `P(clean_sheet)` via Poisson distribution: `P(0 goals) = e^(-λ)` where λ = expected goals conceded.
4. This naturally handles "attractive fixture" ranking — a defender facing a weak-attack team on λ=0.8 has ~45% clean sheet odds; a defender facing a strong attack at λ=2.0 has ~13%.

This is the same approach used by community tools (Dixon-Coles style Poisson models) — nothing exotic needed for v1, just don't skip straight to FPL's crude star rating.

## 3. Optimizer (linear program via PuLP)

**Objective:** maximize `sum(xP_i * x_i) + max(xP_i * x_i for i in starting_XI) ` (captain doubles their contribution — add captain as a second binary variable per player, constrained to be 1 of the 11 starters).

**Constraints:**
- Total squad = 15 players: exactly 2 GK, 5 DEF, 5 MID, 3 FWD
- Total cost ≤ £100.0m (use `now_cost` from FPL API, which is in tenths — divide by 10)
- Max 3 players from any single real team
- Starting XI = 11 of the 15, valid formation: 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD
- Exactly 1 captain, chosen from the starting XI
- (v2, transfers) if optimizing from an existing squad rather than from scratch: minimize changes beyond N free transfers, or allow a "hit" of -4 pts per extra transfer as a penalty term in the objective

**v1 scope:** single-gameweek squad selection from scratch (build best possible 15 + XI + captain for the upcoming GW). **v2:** given an existing squad, suggest the highest-value 1-2 transfers. **v3 (later):** multi-gameweek horizon accounting for fixture swings and chip usage (wildcard, bench boost, triple captain, free hit) — meaningfully harder, don't attempt until v1/v2 are solid.

## 4. What this means for data pipeline scope

The DefCon stat is the one piece not available from the FPL API or the standard Understat/vaastav datasets — worth confirming a source for CBIT/CBIRT match-event data before building the model, or shipping v1 without the DefCon term and adding it once a data source is confirmed (the model degrades gracefully without it, just underrates high-tackle defenders/mids slightly).
