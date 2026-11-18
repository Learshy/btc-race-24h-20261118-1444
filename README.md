# Hour-momentum rider — BTC trading bot

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Learshy/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Learshy/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

An entry for [make.fun's BTC trading bot race](https://make.fun/bounty/btc-race-24h-20261118-1444): a long-only cbBTC/USDC bot that trades the 24-hour replay minute by minute, starting from 1,000 USDC of paper money.

## Strategy

Buy the whole stack when the last hour's return is clearly up, ride it with a trailing stop, and otherwise sit in cash.

- **Entry, when flat:** the 60-minute return (this close / the close 60 bars back − 1) exceeds **+0.3%**. Buy with all cash.
- **Exit, when long:** sell the whole position when this close falls **0.8%** below the highest close seen since entry (trailing stop, tracked from the decision close and updated every bar).
- **Nothing else:** no take-profit, no trend filter, no second confirmation — each was measured on the dev window and made the result worse. Two numbers, one entry rule, one exit rule.
- Orders carry `max_slippage_bps: 100` (1% past the close they were decided on).

## Why this shape

The dev window is a choppy, slightly falling day (BTC −2.8% over 24h, 1-minute noise ~6.7 bps against a ~26 bps round trip), and every house baseline loses on it: EMA(8/21) cross is whipsawed (−$148 on 80 trades), RSI/Bollinger mean-reversion buys into the downtrend (−$40), buy-and-hold rides the fall (−$32). What the data does show is hourly momentum: the 60-minute log return's lag-1 autocorrelation is about +0.26, while 15-minute returns mean-revert (about −0.25). So the signal lives at the hour, not the minute. A 60-minute return above +0.3% is a real move (about 4–5x the 1-minute noise); a 0.8% trailing stop is about 12x the 1-minute noise, so it is not tripped by noise but cuts the trade when the trend genuinely turns.

## Dev-window result (kit `grade-local`, `--driver process`)

- **Net PnL: +$8.81 USDC** (return +0.88%) — passes the dev gate (net PnL > 0)
- **Trades: 4** (2 round trips), **max drawdown: 1.4%** — guardrails met
- One good ride of the morning rally, one small loser cut by the trailing stop.

## Files

- `main.ts` — the bot (entrypoint, run as `node /bot/main.ts`)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's `sdk/makefun-bars.ts` shim (the protocol layer)

Determinism: only the closes decide, in float64 (IEEE 754, the same operations in the same order every run). No clock, no environment, no randomness, no files. Two runs produce byte-identical action logs.
