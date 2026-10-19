# Camel Exchange

A multiplayer educational trading game with a vanilla HTML/CSS/JavaScript frontend and a real Node.js WebSocket backend (`ws`). No simulated sockets or client-authoritative trading. Play coins only.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

Open http://localhost:3000. Enter a name and leave the code blank to create a room. Other players join with the code or copied invite link. The host starts the race. To test multiple players locally, use separate tabs (session tokens are tab-local) and join with different names. Solo play is supported.

For players on the same network, visit `http://YOUR-LAN-IP:3000`. For internet play, deploy this project to a Node.js host that supports WebSocket upgrades and put it behind HTTPS. The browser automatically uses WSS under HTTPS. `PORT` (default 3000) and `HOST` (default 0.0.0.0) are configurable. `GET /health` is available for health checks.

```sh
npm test
```

## Rules

- 100 starting coins; 8 independently random moves across 2 legs of 4 moves.
- Each move selects Red or Blue with equal probability using server-side cryptographic randomness. There is no stacking.
- Reference price = 50 + 5 × (Red position − Blue position).
- Each 20-second trading window precedes a move, followed by a 2.2-second reveal. No trading during reveal. All trades are market orders filled immediately at the common displayed quotes. Trades do not change quotes or barriers.
- Red share: redeems at final reference price.
- Vanilla call: strike 50, pays max(final price −50, 0).
- Up-and-out call: same strike and payoff, but permanently knocked out on any observed price ≥65. A knocked-out instrument cannot be traded.
- All instruments settle after move 8. Barrier monitoring happens after each move, before settlement. Buying later does not extend expiry or reset barrier history.
- The bank computes exact expected terminal payoffs over all remaining equally likely paths, rounded to the nearest cent. Bid is fair value minus 0.25 coins (floored at zero); ask is fair plus 0.25. Shares have fair value equal to current reference price under this fair random walk. No interest or inventory skew.
- Max 10 held units per instrument and 10 total units traded per window. Long-only; no debt. Buy/sell buttons trade one unit; the validated protocol supports integer quantities 1–10.
- Equity uses current bid/liquidation value, so newly purchased holdings immediately reflect the spread. Final score is cash after redemption. Equal scores are ties.

## Architecture and protocol

`game.js`: deterministic rules, exact recursive valuation, integer-cent balances, order validation, barrier tracking, settlement.

`server.js`: same-origin HTTP assets and WebSockets, rooms, timers, secure random player/session IDs, reconnect tokens, authoritative state broadcasts, host-only start/reset, payload/rate/room limits, idle room cleanup.

`public/`: responsive race board, price chart, market quotes, portfolio, leaderboard, transaction history, explanations, server-adjusted countdown, reconnect flow.

Client messages:

```json
{"type":"join","name":"Katie","room":"ABC123"}
{"type":"join","room":"ABC123","token":"returned-session-token"}
{"type":"start"}
{"type":"trade","asset":"call","side":"buy","quantity":1,"revision":1}
{"type":"reset"}
```

Omit `room` to create a room. Server replies with `joined`, `state`, or `error`. Session tokens are only returned to their owning socket; player portfolios are private, leaderboard equity is shared. Every trade validates phase, server deadline, quote revision, asset, side, integer quantity, cash, holdings and volume limits. WebSocket messages are ordered, so commands on a connection execute serially. Keep session tokens private; they authorize resuming that player's session.

## Deployment limits

This is a runnable full-stack source project, not an already hosted service. Run **one server instance**: room state is in memory and is lost on restart. Rooms without sockets are deleted after an hour. A disconnected host can resume using the same browser tab's stored token; host control is not transferred automatically. New players cannot join a race already in progress. Open a new tab to play as a different person.

Before a large/public deployment, add durable shared room storage or an actor service, user authentication, distributed abuse controls and infrastructure observability. Do not use multiple replicas without shared room coordination or room-affine routing. The app intentionally has no real-money functionality. Tests cover core financial rules and a two-client socket session including reconnect and final settlement; no automated browser visual test was available in the authoring environment.

## Interactive payoff explorer

Use **Add to payoff** on any market card to select one or more instruments. The expiry chart shows individual dashed lines and a solid combined sum. Change quantities (1–10) and inspect a final price using the slider. Selection is hypothetical and never places a trade. Payouts exclude purchase costs; they are not profit/loss diagrams.

For knockout calls, choose whether the barrier was touched earlier. The chart separately applies the final barrier observation at 65, displaying the payoff discontinuity without joining across it. Once the live race knocks out the contract, its hypothetical payoff is forced to zero. Curves cover illustrative continuous prices; actual terminal race prices lie on a discrete grid and possible outcomes narrow during the race.
