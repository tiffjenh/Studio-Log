# UI Button/Calendar QA Checklist

## Scope
- Login/Signup page segmented controls (`Log in`, `Sign up`) use white `secondary` small buttons.
- Removed bottom auth links ("Don't have an account? Sign up" and "Already have an account? Log in").
- Calendar/day navigation arrows use shared thin chevron icons and muted text color.
- Calendar day selector chip typography is consistent between weekday and date number.
- Calendar picker icon has no gradient background.
- All buttons with label `Save` use shared `secondary` + `sm` button styles.

## Manual Validation Steps
- Open landing auth page and verify segmented controls are readable against gradient, white-based, and still show active state.
- Verify no bottom auth text links are rendered under login/signup forms.
- Open calendar page and verify weekday + date number use same font size/weight/color, with selection indicated by chip background.
- Check day/month navigation arrows in calendar, dashboard, earnings, and date picker: thin stroke, muted color, not visually heavy.
- Open lesson edit/reschedule and student edit flows; confirm each `Save` action uses white secondary small button style.

## Repo Checks Run
- Search for removed auth strings: no render-time matches in app pages/components.
- Search for `Save` button usages and confirm they map to shared `Button` with `variant="secondary"` and `size="sm"`.
