# Insights Metrics Definitions

This document describes how Insights Q&A computes values so results stay consistent with the Earnings screens.

## Data source and completion definition

- Insights uses lesson rows from the same in-memory store used by the UI when available.
- A lesson counts toward revenue metrics only when `completed === true`.
- Revenue uses `amountCents` on completed lessons.
- Lessons are deduped to one row per `(studentId, date)` before aggregation.

## Period resolution

- Relative periods:
  - `last month` -> prior calendar month (e.g. `2026-01-01..2026-01-31`)
  - `this month` -> current calendar month
  - `last 30 days` -> rolling 30-day window ending today
  - `YTD` -> `YYYY-01-01..today`
- Explicit periods:
  - `2025` -> `2025-01-01..2025-12-31`
  - `January 2026` -> `2026-01-01..2026-01-31`

## Metric definitions

- `earnings_in_period`: sum of `amountCents` over completed lessons in period.
- `lessons_count_in_period`: count of completed lessons in period.
- `revenue_per_lesson_in_period`: `sum(amountCents) / completed_lesson_count`.
- `revenue_per_student_in_period`: grouped completed revenue by student, sorted desc.
- `day_of_week_earnings_max`: weekday with max completed revenue in period.
- `avg_weekly_revenue`: mean of weekly completed revenue totals in period.
- `cash_flow_trend`: weekly completed revenue series + direction (`up|down|flat`).
- `income_stability`: coefficient of variation over weekly totals with label:
  - `< 0.20` -> `stable`
  - `0.20..0.45` -> `moderate`
  - `> 0.45` -> `volatile`

## Top N behavior

- For prompts like `Top 3 students by revenue`, Insights returns exactly `N` rows when possible.
- If fewer than `N` students have revenue in the period, it returns all available rows and states that only `X` students had revenue.
