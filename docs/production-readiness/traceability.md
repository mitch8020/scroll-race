# Acceptance traceability and final rerun

The final JSON report is regenerated at
`.smoke/readiness-evidence/report.json`.

| Scenario                                           | Inventory covered                                            | Final result |
| -------------------------------------------------- | ------------------------------------------------------------ | ------------ |
| PR-HTTP-01 production assets and metadata          | RT-01, RT-05                                                 | Passed       |
| PR-UI-01 fresh desktop inventory and scale board   | R-NEW, UI-01, UI-03, UI-05, UI-06, UI-10-12, RT-06, UI-33-34 | Passed       |
| PR-UI-02 keyboard, calibration, sound, persistence | UI-02, UI-06-10                                              | Passed       |
| PR-UI-03 returning racer local data at every cap   | R-RETURN, UI-02-04, UI-11-12, UI-33                          | Passed       |
| PR-ROUTE-01 challenge and malformed search routes  | R-CHALLENGE, RT-02, UI-02-03                                 | Passed       |
| PR-BOARD-01 empty, offline, hostile responses      | R-DEGRADED, UI-11-12, UI-33                                  | Passed       |
| PR-RESP-01 narrow mobile and wide desktop          | UI-01, UI-34                                                 | Passed       |
| PR-RACE-01 eligible race on every event            | UI-05, UI-13-20, UI-23-25, UI-27, UI-29, UI-32               | Passed       |
| PR-SHARE-01 native failure, save, edit             | R-NEW, UI-21-26                                              | Passed       |
| PR-SHARE-02 clipboard success                      | UI-21                                                        | Passed       |
| PR-WIND-01 ineligible workflow                     | UI-21-22, UI-27, UI-30-31                                    | Passed       |
| PR-MOTION-01 reduced motion                        | R-DEGRADED, UI-19, UI-32                                     | Passed       |
| `scrollRace.test.ts`                               | RT-02; UI-02, UI-18, UI-20-22, UI-31                         | 33 passed    |
| `localRaceStore.test.ts`                           | R-RETURN, R-DEGRADED; UI-02-04, UI-07-12, UI-23-26           | 5 passed     |
| `board.test.ts`                                    | RT-03-04; UI-24, UI-31, UI-33                                | 16 passed    |
| `globalBoard.test.ts`                              | UI-11, UI-33                                                 | 3 passed     |

Manual visual evidence is captured at 320 and 1440 pixels, eligible finishes
at 100 and 1000 feet, the full world board, wind-assisted finish, and any
failed scenario. Assertions—not screenshots—decide pass/fail.

## Final result

- 12/12 browser scenarios passed.
- 4/4 event workflows completed with eligible submissions.
- 57/57 unit/integration tests passed.
- No page errors or console errors occurred in the clean browser run.
- Local boards stayed at 10 entries and world fixtures stayed at the 100-entry
  storage cap.
- No production system, real user data, secret, or destructive operation was
  used.
