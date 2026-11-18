// Hour-momentum rider: a long-only cbBTC/USDC bot for agent-fun/bars-replay/v1.
//
// The idea, in one sentence: buy the whole stack when the last hour's return
// is clearly up, ride it with a trailing stop, and otherwise sit in cash.
//
// Why this shape. The dev window is a choppy, slightly falling day (BTC
// -2.8% over 24h, 1-minute noise ~6.7 bps against a ~26 bps round trip), and
// every house baseline loses on it: EMA(8/21) cross is whipsawed (-$148 on
// 80 trades), RSI/Bollinger mean-reversion buys into the downtrend (-$40),
// buy-and-hold rides the fall (-$32). What the data does show is hourly
// momentum: the 60-minute log return's lag-1 autocorrelation is about +0.26,
// while 15-minute returns mean-revert (about -0.25). So the signal lives at
// the hour, not the minute. A 60-minute return above +0.3% is a real move
// (about 4-5x the 1-minute noise); a trailing stop 0.8% below the highest
// close since entry is about 12x the 1-minute noise, so it is not tripped by
// noise, but it cuts the trade when the trend genuinely turns. The result on
// the dev window is +$8.81 net PnL on 4 trades (2 round trips, max drawdown
// 1.4%): one good ride of the morning rally, one small loser cut by the stop.
//
// Rules, exactly as implemented:
//   - Entry, when flat: the 60-minute return (this close / the close 60 bars
//     back - 1) exceeds +0.3%. Buy with all cash, one order.
//   - Exit, when long: sell the whole position when this close falls 0.8%
//     below the highest close seen since entry (the trailing stop). The
//     highest close is anchored at the fill bar's close, updated every bar:
//     the peak is only set once the position is actually held, never at the
//     decision close, because the order fills at the next bar's open and
//     trailing from a price the bot never got would tighten (or loosen) the
//     stop by a bar's move for no reason. This matches the backtester, which
//     anchors its peak at the fill price and reproduces the harness grade.
//   - No take-profit, no trend filter, no second confirmation: each of those
//     was measured on the dev window and made the result worse (they exit
//     too early or enter too late). The strategy is deliberately minimal:
//     two numbers, one entry rule, one exit rule.
//   - Orders carry max_slippage_bps 100 (1% past the close they were
//     decided on), the same cap the kit's baselines use.
//   - Every close is read, warm-up batches included, but no order is sent
//     while warming up (the replay would reject it). A batch with no CBBTC
//     bar sends nothing.
//   - Determinism: only the closes decide, in float64 (IEEE 754, the same
//     operations in the same order every run). No clock, no environment, no
//     randomness, no files. Two runs produce byte-identical action logs.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** The momentum lookback, in bars (1-minute bars, so 60 = one hour). */
const LOOKBACK = 60;
/** Enter when the 60-minute return exceeds this (0.3%). */
const ENTRY_RETURN = 0.003;
/** Exit when the close falls this far below the highest close since entry (0.8%). */
const TRAIL = 0.008;
/** Slippage cap on every order, in bps (1% past the close it was decided on). */
const MAX_SLIPPAGE_BPS = 100;

/** The closes seen so far, as raw price units (price_scale 5); ratios are scale-free. */
const closes: number[] = [];
/** Highest close since the current entry, anchored at the fill bar's close (the first close seen while the position is held). Null while flat. */
let peak: number | null = null;

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = Number(bar.c);
    closes.push(close);

    const held = state.positions.get(SYMBOL);
    if (held === undefined) {
      peak = null;
    } else if (peak === null) {
      peak = close;
    }

    if (state.warmingUp) return [];

    if (held === undefined) {
      if (closes.length > LOOKBACK) {
        const ret = closes[closes.length - 1] / closes[closes.length - 1 - LOOKBACK] - 1;
        if (ret > ENTRY_RETURN) {
          const cash = state.cash;
          if (cash >= BigInt(state.hello.fees.min_notional_quote_units)) {
            // Do NOT set peak here: the order fills at the next bar's open,
            // so the peak is anchored by the fill bar's close (see the
            // held/peak initialisation above) instead of the decision close.
            const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
            return [buy];
          }
        }
      }
      return [];
    }

    if (peak !== null) {
      if (close > peak) peak = close;
      if (close < peak * (1 - TRAIL)) {
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [sell];
      }
    }
    return [];
  },
});
