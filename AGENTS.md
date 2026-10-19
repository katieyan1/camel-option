# Camel Exchange — agent context

## Purpose and scope

This project is an educational multiplayer game inspired by Camel Up, simplified to two camels to teach ordinary options and path-dependent barrier options. The user asked for a frontend and socket-based backend, then an interactive payoff diagram that sums multiple selected instruments. Keep the experience understandable for options beginners. All money is fictional.

This is a runnable source project, not an already deployed website. Do not replace its real multiplayer backend with a static mock or browser-only simulation.

## Current design decisions

- Two camels, Red and Blue; no stacking or player-controlled movement.
- Eight independent random movement events, grouped into two legs of four.
- Each event advances exactly one randomly selected camel one space with equal probability. A leg does NOT guarantee equal movement for both camels.
- Reference price: `50 + 5 * (redPosition - bluePosition)`. Starts at 50; final prices are 10, 20, …, 90.
- Everyone trades simultaneously in a 20-second window before each event. Orders execute immediately at the displayed quotes, not in a closing auction.
- A 2.2-second reveal pauses trading between windows. The server owns deadlines and movement.
- All instruments settle after event eight. The end of leg one is a checkpoint, not expiry. Buying later never extends an option's lifetime.
- The game is the market maker. Player trades do not move quotes, the reference price, or barriers. Inventory-based quoting was discussed but is not implemented.

## Instruments and accounting

| Instrument | Terminal cash payout per unit |
| --- | --- |
| Red share (`share`) | Final reference price |
| Vanilla call (`call`) | `max(finalPrice - 50, 0)` |
| Up-and-out call (`barrier`) | Same call payoff, unless reference price ever reaches or exceeds 65 |

The barrier is monitored after every event, including the final event BEFORE settlement. Touching 65 counts. Knockout is permanent and applies to the shared contract's entire race history, not just the period since purchase. Knocked-out calls cannot be traded.

- Starting balance: 100 coins. Server balances, quotes, costs, and settlement amounts are integer cents. Reference prices and payoff-explorer calculations are in coins; convert explicitly at boundaries.
- Fair values are exact expected terminal payouts over the remaining equally likely race paths, not Black–Scholes estimates. Round the expectation to cents before adding the spread.
- Bid = max(0, fair value − 0.25 coins); ask = fair value + 0.25 coins. Knocked-out quotes are zero and disabled.
- Long-only. No borrowing, uncovered option writing, or short selling.
- Maximum holdings: 10 units per instrument. Maximum traded volume: 10 units total (buys plus sells) per player per window.
- UI buttons trade one unit; the protocol validates integer quantities 1–10.
- Portfolio equity uses cash plus holdings valued at current bids. Final score is cash after redemption; ties are allowed.
- Payout and profit are different. Do not label a gross payout as profit or silently omit premiums in a profit calculation.

## Payoff explorer

The user specifically requested selecting a stock/option to show its payoff diagram and summing diagrams when multiple instruments are selected.

- `Add to payoff` on each market card toggles an instrument in the hypothetical selection.
- Quantities range from 1 to 10. Selection does not place trades or alter actual holdings.
- Individual dashed curves and a solid combined curve show gross terminal cash payouts, excluding purchase costs.
- A final-price slider displays exact component and total values.
- Barrier scenarios distinguish an earlier touch from no earlier touch. Even with no earlier touch, a final price ≥65 knocks out the option.
- The curve must break at the barrier discontinuity; do not interpolate a sloped line across it. Use open/closed endpoint markers.
- If the live race has already hit the barrier, force its payoff to zero regardless of the scenario control.
- Continuous curves are illustrative. Actual terminal prices lie on a discrete grid, and possible outcomes narrow as the race progresses. The explorer is not a prediction of which paths remain reachable.

## Code map

- `game.js`: deterministic game model, valuation, quotes, validation, movement and settlement.
- `server.js`: Node HTTP asset server plus `ws` WebSocket server; room/session lifecycle, authoritative timers, random movement, state broadcasts and host controls.
- `public/index.html`: lobby, race, market, portfolio, payoff explorer and educational copy.
- `public/style.css`: responsive cream/green visual theme with red/blue race accents.
- `public/app.js`: WebSocket client, reconnect, DOM rendering, SVG charts and hypothetical selection state.
- `public/payoff.js`: pure terminal payoff and quantity-weighted combined payoff functions in coins.
- `test/game.test.js`: rule tests and actual two-client WebSocket integration test.
- `test/payoff.test.js`: combined payouts and barrier edge cases.
- `README.md`: setup, rules, protocol, architecture and deployment limitations.

The frontend is vanilla ES modules with no bundler. The backend uses Node ES modules and the `ws` dependency. The server uses an explicit static-file allowlist; add new browser modules/assets there when needed.

## Multiplayer invariants

- The server alone validates and executes trades. UI disabling is only a convenience.
- Validate phase, absolute deadline, quote revision, asset, side, integer quantity, cash, holdings and volume before mutation.
- Player session tokens authorize reconnection; never put them in public broadcasts, invite links or logs.
- Public leaderboard entries contain name, connection status and equity. Detailed portfolio/trade history is sent only to the owning player.
- Only the host can start or reset. Reset is allowed after settlement; preserve player identities and active socket associations.
- New players cannot join an active race; existing players can reconnect using their token.
- Starting another connection with the same token replaces the old connection. The old connection's close handler must not mark the new session disconnected.
- Player names must be rendered as text, not interpolated as HTML.
- Use server-generated secure randomness for room/session IDs and camel movement.

## Run and check

Requires Node.js 22 or newer.

```sh
npm ci
npm start
# Visit http://localhost:3000
npm test
node --check public/app.js
```

`PORT` defaults to 3000; `HOST` defaults to 0.0.0.0. `/health` is available. Use separate tabs with distinct names for local multiplayer; reconnect tokens are stored in tab-local session storage.

For gameplay or socket changes, run `npm test`. Add focused tests for changed financial or synchronization behavior. For UI-only changes, check syntax and inspect relevant interactions when browser tooling is available. Do not claim visual browser verification unless it was actually performed. Documentation-only edits do not need a full test run.

The current automated suite has eight tests, including path-dependent payouts, order validation, quantities, barrier equality, synchronized two-client play, reconnect, settlement and restart. Browser visual checks were not available during initial development.

## Deployment and known limits

- Single Node server instance with in-memory rooms; restart loses room state. Empty rooms are cleaned up after an hour.
- Internet hosting must support WebSocket upgrades; use HTTPS/WSS. Static hosting alone is insufficient.
- Multiple replicas need room-affine routing or shared room coordination; do not assume in-memory state is shared.
- A disconnected host must reconnect; automatic host reassignment is not implemented.
- No account authentication, durable game history, puts, inventory skew or real-money support.
- Local payload and request-rate limits exist, but large public deployment needs infrastructure-level controls and durable coordination.

## Working conventions

Keep changes scoped to the user's request and preserve the simple two-camel teaching model unless asked to change it. Prefer existing modules and styling over adding frameworks. Update README when user-facing rules or setup change. Never include `node_modules`, credentials, runtime tokens or `.env` files in distributable archives. Keep the source project and delivered archive consistent.
