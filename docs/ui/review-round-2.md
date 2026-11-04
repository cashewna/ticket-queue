# UI review — round 2

Independent, read-only critic with no round-1 context. Screenshots: `docs/ui/round-2/`.

## Scores

| # | Criterion | Score | Evidence |
|---|---|---|---|
| 1 | Task completion | 8.5 | One-screen create path; Resolve is the single primary action; 404 recovers. Close step not shown in captures. |
| 2 | State clarity | 8 | 1440 queue unambiguous; at 360 card labels had been removed, and breach age read like an update time. |
| 3 | Information hierarchy | 7 | Desktop rail correct; mobile SLA/Actions still preceded Description. |
| 4 | Density and scanning | 7 | 24 rows in ~2,400px at 1440; mobile cards 190–234px each; Updated column duplicated the meta line. |
| 5 | Consistency | 8 | Token system enforced; stopped-SLA copy and date formats diverged. |
| 6 | Copy and labels | 7 | Action-led, but generic status flash and SLA jargon for requesters. |
| 7 | Accessibility | 7.5 | AA contrast, visible 3px focus, labels, 44px controls. Hidden `thead` and 16px radio focus were weak points. |
| 8 | Feedback and states | 7.5 | All states existed; the fixed loading pill overlapped the nav at 360/768. |
| 9 | Responsiveness | 6.5 | 768 queue used cards (5,380px); SLA subtitle clipped mid-word at 360; requester header wrapped to three rows. |
| 10 | Trust and polish | 7.5 | Timestamps legible; resolved-late tickets lost their breach signal; requester rail had a large gap. |

## Overall

Overall: 7.5/10. Hard cap: no — contrast and focus passed.

## Top five changes

1. Collapse the 360 header and stop the loading pill landing on the nav.
2. Fix mobile queue cards: clipped SLA text, missing labels, table semantics.
3. Put ticket content before SLA/actions on small screens; make the detail rail one column.
4. Show tickets on the first 360 screen and avoid the 900px table breakpoint.
5. Keep a met/missed SLA outcome after resolution and label breach age.

## What already worked

AA contrast and focus, error summary with anchors and focus, real empty/404 states, 1440 queue scanning, one primary Resolve action, honest login/demo panel, state machine reflected in the UI.

## Remaining gaps

Generic flash copy, breached stat count hidden from assistive tech, mobile table semantics, priority-card focus, colour collision, requester SLA jargon, mobile breach note hidden, coarse relative times, unconvincing progress bar, no sort affordance.
