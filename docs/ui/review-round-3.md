# UI review — round 3

Independent, read-only critic with no prior review context. Screenshots: `docs/ui/round-3/`. This is the final permitted review round.

## Scores

| # | Criterion | Score | Evidence |
|---|---|---|---|
| 1 | Task completion | 8 | Create → assign → comment → resolve → close reachable; closed tickets are terminal and offer no follow-up path. |
| 2 | State clarity | 8 | Status, priority, owner and explicit Breached/Missed/deadline text; Missed vs Breached not explained, 100% SLA bar reads as a divider. |
| 3 | Information hierarchy | 7 | Desktop sound; Add comment competed as a second blue primary; mobile SLA card preceded Description. |
| 4 | Density and scanning | 5 | 1440 excellent (24 rows ~1,500px); 641–900px used a cramped five-column table with split dates and three-line subjects. |
| 5 | Consistency | 7 | Tokens and badges consistent; nav/heading vocabulary, date formats and closed-state cards diverged. |
| 6 | Copy and labels | 7 | Mostly plain and action-led; generic status flash, agent/requester shared empty-comment copy, SLA jargon leaked. |
| 7 | Accessibility | 7 | AA contrast, visible focus, labels, skip link; 20–23px subject target at tablet widths and table semantics lost in card mode. |
| 8 | Feedback and states | 8 | Loading, empty, error, success, 404 and resolved/closed states all present; flash names the event but not the value. |
| 9 | Responsiveness | 7 | No horizontal scroll or clipping; 360 requester header wrapped to three rows; 768 table cramped. |
| 10 | Trust and polish | 7 | Empty Assignment/Priority cards on closed tickets; priority remained editable on resolved tickets and could rewrite the SLA outcome. |

## Overall

Overall: 7.1/10. Hard cap: no — body text passed WCAG AA at 5.9:1 or better and focus was visible.

## Top five changes

1. Restore compact cards for 641–900px instead of a squeezed five-column table.
2. Remove empty Assignment/Priority cards on closed tickets and reconcile the closed-state message.
3. Move Assignment ahead of Conversation/History on narrow screens.
4. Stop the 360 requester header wrapping to three rows.
5. Make the whole queue row a real target.

## What already worked

Clean login at all widths, create-form error pattern, 1440 queue scanning, explicit SLA text rather than colour-only, empty/404/resolved/closed states, 360 card labels for ambiguous cells, one token file, honest demo footer.

## Remaining gaps

Two blue primaries, SLA bar magnitude, date format drift, requester-facing SLA jargon, no reopen path, requester People card duplicates self, empty-comment copy, ragged 360 priority grid, loading pill can cover footer, table semantics in card mode.

## Post-review fixes (not rescored)

After this final round the following were implemented: compact four-column cards for 641–900px; closed-page empty cards removed; assignment and priority locked once completed; comment action demoted to secondary; closed-state copy made specific; header role badge hidden below 40rem and name truncated; card SLA label moved onto its own line; four-state SLA outcome retained for completed tickets; generic flash copy replaced with event-specific messages. Final captures live in `docs/ui/round-final/`.
