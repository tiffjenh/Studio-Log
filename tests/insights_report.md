# Insights Strict Test Report
_Generated: 2026-02-19T19:59:21.757Z_

- **Total:** 158
- **Pass:** 106 (67%)
- **Fail:** 52

## Fail Reason Distribution

- `unexpected_clarification`: 40
- `intent_mismatch:clarification`: 36
- `irrelevant_default_template`: 3
- `numeric_mismatch:avg_monthly_earnings_dollars`: 2
- `percent_missing_or_mismatch`: 2
- `intent_mismatch:avg_hourly_rate`: 2
- `numeric_mismatch:total_earnings_dollars`: 1
- `intent_mismatch:top_student_by_earnings`: 1
- `intent_mismatch:percent_change_yoy`: 1
- `intent_mismatch:lessons_count`: 1
- `intent_mismatch:earnings_by_range`: 1
- `intent_mismatch:cash_flow`: 1
- `numeric_mismatch:projected_yearly_dollars`: 1
- `numeric_mismatch:estimated_tax_yearly_dollars`: 1

## Intent Accuracy (Per-Intent Breakdown)

| intent | pass | fail | total | % |
|--------|------|------|-------|---|
| earnings_by_range | 16 | 9 | 25 | 64% |
| top_student_by_earnings | 6 | 4 | 10 | 60% |
| what_if_rate_change | 7 | 2 | 9 | 78% |
| tax_estimate | 7 | 1 | 8 | 88% |
| percent_change_yoy | 5 | 2 | 7 | 71% |
| avg_hourly_rate | 4 | 2 | 6 | 67% |
| cash_flow | 6 | 0 | 6 | 100% |
| earnings_in_month | 3 | 3 | 6 | 50% |
| best_month | 5 | 1 | 6 | 83% |
| clarification | 6 | 0 | 6 | 100% |
| on_track | 2 | 3 | 5 | 40% |
| forecast | 4 | 1 | 5 | 80% |
| most_per_hour | 4 | 1 | 5 | 80% |
| lowest_student_by_hourly_rate | 4 | 1 | 5 | 80% |
| what_if_lose_students | 4 | 1 | 5 | 80% |
| avg_lessons_per_week | 1 | 3 | 4 | 25% |
| what_if_add_students | 3 | 1 | 4 | 75% |
| worst_month | 3 | 1 | 4 | 75% |
| revenue_per_student_breakdown | 1 | 2 | 3 | 33% |
| revenue_concentration | 0 | 3 | 3 | 0% |
| lessons_count | 3 | 0 | 3 | 100% |
| best_day_of_week | 2 | 1 | 3 | 67% |
| lowest_student_by_revenue | 1 | 2 | 3 | 33% |
| total_hours | 2 | 1 | 3 | 67% |
| student_ytd | 1 | 2 | 3 | 33% |
| revenue_per_lesson | 2 | 0 | 2 | 100% |
| revenue_per_hour | 2 | 0 | 2 | 100% |
| avg_monthly_earnings | 0 | 2 | 2 | 0% |
| earnings_total | 0 | 1 | 1 | 0% |
| students_below_avg_rate | 1 | 0 | 1 | 100% |
| student_earnings_for_year | 1 | 0 | 1 | 100% |
| student_hourly_rate | 0 | 1 | 1 | 0% |
| lowest_hourly_student | 0 | 1 | 1 | 0% |

## Paraphrase Coverage (Intent Routing Consistency)
```
✓ = 100%  ~ = ≥75%  ✗ = <75%

✗ avg_hourly_rate: 3/5 (60%)  → misrouted: clarification×2
✗ avg_lessons_per_week: 0/3 (0%)  → misrouted: lessons_count×1, clarification×2
✗ avg_monthly_earnings: 1/2 (50%)  → misrouted: earnings_by_range×1
✗ best_day_of_week: 1/2 (50%)  → misrouted: clarification×1
~ best_month: 5/6 (83%)  → misrouted: clarification×1
✓ cash_flow: 3/3 (100%)
✗ earnings_by_range: 15/24 (63%)  → misrouted: clarification×9
✗ earnings_in_month: 3/6 (50%)  → misrouted: clarification×3
✗ forecast: 2/3 (67%)  → misrouted: cash_flow×1
✓ lessons_count: 2/2 (100%)
✗ lowest_hourly_student: 0/1 (0%)  → misrouted: avg_hourly_rate×1
~ lowest_student_by_hourly_rate: 3/4 (75%)  → misrouted: clarification×1
✗ lowest_student_by_revenue: 1/3 (33%)  → misrouted: clarification×2
~ most_per_hour: 3/4 (75%)  → misrouted: top_student_by_earnings×1
✗ on_track: 1/4 (25%)  → misrouted: clarification×3
✓ percent_change_yoy: 7/7 (100%)
✗ revenue_concentration: 1/2 (50%)  → misrouted: percent_change_yoy×1
✓ revenue_per_hour: 2/2 (100%)
✓ revenue_per_lesson: 1/1 (100%)
✗ revenue_per_student_breakdown: 0/2 (0%)  → misrouted: clarification×2
✓ student_earnings_for_year: 1/1 (100%)
✗ student_hourly_rate: 0/1 (0%)  → misrouted: avg_hourly_rate×1
✓ student_ytd: 3/3 (100%)
✓ tax_estimate: 5/5 (100%)
✗ top_student_by_earnings: 4/8 (50%)  → misrouted: clarification×4
✗ total_hours: 2/3 (67%)  → misrouted: clarification×1
✗ what_if_add_students: 2/3 (67%)  → misrouted: clarification×1
~ what_if_lose_students: 3/4 (75%)  → misrouted: clarification×1
✗ what_if_rate_change: 4/6 (67%)  → misrouted: clarification×2
~ worst_month: 3/4 (75%)  → misrouted: clarification×1
```

## Top Failing Questions

- **cat-revenue-forecasting-4** Show my earnings summary
  - Expected: `—` → Detected: `earnings_total`
  - Fail reasons: irrelevant_default_template, numeric_mismatch:total_earnings_dollars
  - Answer: You have 19 earnings entries, totaling $2,440.
- **cat-student-level-insights-4** Top 3 students by revenue?
  - Expected: `—` → Detected: `revenue_concentration`
  - Fail reasons: irrelevant_default_template
  - Answer: You have 19 earnings entries, totaling $2,440.
- **q036** ¿Quién es mi estudiante que paga más por hora?
  - Expected: `most_per_hour` → Detected: `top_student_by_earnings`
  - Fail reasons: intent_mismatch:top_student_by_earnings
  - Answer: Leo Chen pays the most: $180 total.
- **q045** What percentage of my revenue comes from my top 3 students?
  - Expected: `revenue_concentration` → Detected: `percent_change_yoy`
  - Fail reasons: intent_mismatch:percent_change_yoy
  - Answer: You made 4.3% less in 2026 than 2025.
- **q048** What’s my average monthly income this year?
  - Expected: `avg_monthly_earnings` → Detected: `avg_monthly_earnings`
  - Fail reasons: numeric_mismatch:avg_monthly_earnings_dollars
  - Answer: Your average monthly income is $207.5.
- **q050** If I stop working Fridays, how much revenue would I lose?
  - Expected: `what_if_lose_students` → Detected: `clarification`
  - Fail reasons: unexpected_clarification, intent_mismatch:clarification
  - Answer: What would you like to know? (e.g. earnings comparison, top student, forecast)
- **q052** How much did I bill in March 2026?
  - Expected: `earnings_in_month` → Detected: `clarification`
  - Fail reasons: unexpected_clarification, intent_mismatch:clarification
  - Answer: What would you like to know? (e.g. earnings comparison, top student, forecast)
- **q055** Revenue this month versus last month
  - Expected: `earnings_by_range` → Detected: `clarification`
  - Fail reasons: unexpected_clarification, intent_mismatch:clarification
  - Answer: What would you like to know? (e.g. earnings comparison, top student, forecast)
- **q059** List revenue by student.
  - Expected: `revenue_per_student_breakdown` → Detected: `clarification`
  - Fail reasons: unexpected_clarification, intent_mismatch:clarification
  - Answer: What would you like to know? (e.g. earnings comparison, top student, forecast)
- **q060** Show the student earnings breakdown.
  - Expected: `revenue_per_student_breakdown` → Detected: `clarification`
  - Fail reasons: unexpected_clarification, intent_mismatch:clarification
  - Answer: What would you like to know? (e.g. earnings comparison, top student, forecast)

## All Rows (first 40)

| id | verdict | expected | detected | truth_key |
|---|---|---|---|---|
| cat-revenue-forecasting-0 | PASS | — | on_track | on_track_projection |
| cat-revenue-forecasting-1 | PASS | — | earnings_by_range | earnings_by_range |
| cat-revenue-forecasting-2 | PASS | — | forecast | forecast_projection |
| cat-revenue-forecasting-3 | PASS | — | forecast | forecast_projection |
| cat-revenue-forecasting-4 | FAIL | — | earnings_total | total_earnings_ytd |
| cat-pricing-rate-optimization-0 | PASS | — | most_per_hour | highest_hourly_student |
| cat-pricing-rate-optimization-1 | PASS | — | avg_hourly_rate | avg_hourly_rate |
| cat-pricing-rate-optimization-2 | PASS | — | students_below_avg_rate | students_below_avg_rate |
| cat-pricing-rate-optimization-3 | PASS | — | what_if_rate_change | simulate_rate_increase |
| cat-student-level-insights-0 | PASS | — | top_student_by_earnings | top_student_by_earnings |
| cat-student-level-insights-1 | PASS | — | top_student_by_earnings | top_student_by_earnings |
| cat-student-level-insights-2 | PASS | — | lowest_student_by_hourly_rate | lowest_hourly_student |
| cat-student-level-insights-3 | PASS | — | revenue_per_student_breakdown | earnings_by_student_breakdown |
| cat-student-level-insights-4 | FAIL | — | revenue_concentration | revenue_concentration_top3 |
| cat-cash-flow-stability-0 | PASS | — | cash_flow | cash_flow_summary |
| cat-cash-flow-stability-1 | PASS | — | cash_flow | cash_flow_summary |
| cat-cash-flow-stability-2 | PASS | — | cash_flow | cash_flow_summary |
| cat-operational-metrics-0 | PASS | — | lessons_count | total_lessons |
| cat-operational-metrics-1 | PASS | — | revenue_per_lesson | revenue_per_lesson |
| cat-operational-metrics-2 | PASS | — | best_day_of_week | best_day_of_week |
| cat-operational-metrics-3 | PASS | — | avg_lessons_per_week | avg_lessons_per_week |
| cat-tax-financial-planning-0 | PASS | — | tax_estimate | estimated_tax_set_aside |
| cat-tax-financial-planning-1 | PASS | — | tax_estimate | estimated_tax_set_aside |
| cat-tax-financial-planning-2 | PASS | — | tax_estimate | estimated_tax_set_aside |
| cat-what-if-modeling-0 | PASS | — | what_if_add_students | simulate_add_students |
| cat-what-if-modeling-1 | PASS | — | what_if_rate_change | simulate_rate_increase |
| cat-what-if-modeling-2 | PASS | — | what_if_lose_students | simulate_lose_students |
| cat-what-if-modeling-3 | PASS | — | what_if_rate_change | simulate_rate_increase |
| q001 | PASS | earnings_by_range | earnings_by_range | earnings_by_range |
| q002 | PASS | earnings_by_range | earnings_by_range | earnings_by_range |
| q003 | PASS | earnings_in_month | earnings_in_month | earnings_by_month |
| q004 | PASS | earnings_by_range | earnings_by_range | total_earnings_ytd |
| q005 | PASS | earnings_by_range | earnings_by_range | earnings_by_range |
| q006 | PASS | top_student_by_earnings | top_student_by_earnings | top_student_by_earnings |
| q007 | PASS | most_per_hour | most_per_hour | highest_hourly_student |
| q008 | PASS | lowest_student_by_hourly_rate | lowest_student_by_hourly_rate | lowest_hourly_student |
| q009 | PASS | lowest_student_by_revenue | lowest_student_by_revenue | lowest_student_by_revenue |
| q010 | PASS | best_month | best_month | best_month |
| q011 | PASS | best_month | best_month | best_month |
| q012 | PASS | worst_month | worst_month | worst_month |
