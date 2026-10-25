# PlaceX build log

Running log of every phase, who built what, and when. Times are PT, Oct 24 to 25, 2026.
This session runs inside Cursor's integrated terminal with Claude Code as the lead orchestrator and parallel subagents in git worktrees.

## Phase 0: environment setup (22:58 to 23:10)

Checked and installed:

| Item | Result |
| --- | --- |
| git | 2.54.0 |
| node / npm | v24.16.0 / 11.13.0 |
| python3 / pip | 3.14.6 / 26.1.2 |
| SpacetimeDB CLI | installed 2.13.0 via the official installer (`install.spacetimedb.com`) |
| Module language | **TypeScript**. `spacetime init --lang typescript` is supported and stable in CLI 2.13.0 (TypeScript modules run on V8). Rust toolchain not needed. |
| Vercel CLI | 54.14.0, logged in as apollo-ullah |
| GitHub CLI | 2.95.0, logged in as apollo-ullah |
| spacetime login | done, identity c200799d... (maincloud is the default server) |
| Repo | github.com/apollo-ullah/PlaceX, switched from private to public for Devpost |
| Local SpacetimeDB | `spacetime start` running on 127.0.0.1:3000 |
| Hello world | TypeScript module published locally as `hello-local`, reducer called, SQL query returned the row, `spacetime generate --lang typescript` produced bindings |
| NASA archive TAP | reachable (HTTP 200) |
| LLM API key in env | none found, so facts will be hand-written plus templated |

Decisions:
- Server in TypeScript so the repo is one language. SDK package `spacetimedb@2.13.0` provides `spacetimedb/server` for the module and `spacetimedb/react` (`SpacetimeDBProvider`, `useTable`, `useReducer`) for the client.
- Reducer errors thrown as `SenderError('CODE')` reach the client as a rejected promise whose message is the code. That is how `ALREADY_CLAIMED` and friends drive the SNIPED animation.
