# UI review — round 1

Independent, read-only critic. Screenshots: `docs/ui/round-1/`.

## Scores

| # | Criterion | Score | Evidence |
|---|---|---|---|
| 1 | Task completion | 8 | Queue → ticket → Assign to me / Start work / Resolve / Close ticket is visible and reachable. |
| 2 | State clarity | 7 | Status, priority, owner and breach are labelled, but filtered empty results kept showing global stats. |
| 3 | Information hierarchy | 6 | 360px ticket pages put Actions, SLA, People, Assignment and Priority before the Description. |
| 4 | Density and scanning | 4 | 360/768 queue cards were ~250px per ticket, producing ~8,000px pages for 24 rows. |
| 5 | Consistency | 7 | Token layer is consistent; status and priority reused identical colour pairs. |
| 6 | Copy and labels | 8 | Concrete action labels; some audit jargon. |
| 7 | Accessibility | 6 | Strong focus/labels; small secondary-text contrast misses; 32px breadcrumb targets. |
| 8 | Feedback and states | 6 | Empty/error/success existed; loading was a 4px bar with no text. |
| 9 | Responsiveness | 7 | No horizontal scroll, but an 8,000px mobile queue and Description below the fold. |
| 10 | Trust and polish | 7 | Timestamps legible; short-page footer left blank canvas; health link went to raw JSON. |

## Overall

Overall: 6.6/10. Hard cap: no — body text passed AA and focus was visible.

## Top five changes

1. Make the mobile queue compact rather than a tall card per ticket.
2. Put ticket content before controls on narrow screens.
3. Make stats and filtered results tell the same story.
4. Make signed-in identity and small targets accessible.
5. Replace the invisible loading treatment with a real status.

## What already worked

Token discipline, create-form error summary and inline validation, priority/SLA explanation before submit, clear 1440 hierarchy, empty/404 recovery, skip link, labels, 44px controls.

## Remaining gaps

SLA bar scale, resolved SLA cells, status/priority colour collision, one-page pagination noise, short-page footer, mobile stat wrapping, link affordance, login error wiring, nav `aria-current` on ticket detail.
