"""
Institutional Power of 3 (PO3) Algorithmic Trading Strategy (Pure Python Implementation)

Strategy Rules:
1. Higher Timeframe (HTF): 4H / 15M candles.
2. Execution Timeframe (LTF): 1M chart.
3. Time Window: Starts at 10:00 AM EST (4H Candle Open).
4. Accumulation Phase: First 30 minutes (10:00 - 10:30) defines Accumulation High/Low.
5. Manipulation Phase: Price sweeps past Accumulation High/Low into a 15M Fair Value Gap (FVG).
6. Execution Trigger: On 1M chart, price creates a new 1M FVG, retraces into it, and respects it.
7. Risk Management: SL at Manipulation Wick Extreme, TP at Accumulation Target or Risk-to-Reward Ratio.
"""

from datetime import datetime, time, timedelta
import math
import random

class PO3InstitutionalStrategy:
    def __init__(
        self,
        session_start_time="10:00",
        accumulation_minutes=30,
        risk_percent=1.0,
        risk_reward_ratio=1.5,
        sl_buffer_points=0.5,
        use_accum_target=True
    ):
        self.session_start_hour = int(session_start_time.split(":")[0])
        self.session_start_minute = int(session_start_time.split(":")[1])
        self.accumulation_minutes = accumulation_minutes
        self.risk_percent = risk_percent
        self.risk_reward_ratio = risk_reward_ratio
        self.sl_buffer_points = sl_buffer_points
        self.use_accum_target = use_accum_target

    @staticmethod
    def find_15m_fvgs(rates_15m):
        """Find 15M Fair Value Gaps (FVGs) in 15-minute rates list."""
        bullish_fvgs = []
        bearish_fvgs = []

        if len(rates_15m) < 3:
            return bullish_fvgs, bearish_fvgs

        for i in range(len(rates_15m) - 3, -1, -1):
            bar3 = rates_15m[i]       # oldest candle
            bar1 = rates_15m[i + 2]   # newest candle in 3-candle sequence

            # Bullish FVG: Low of bar1 > High of bar3
            if bar1['low'] > bar3['high']:
                bullish_fvgs.append({
                    'top': bar1['low'],
                    'bottom': bar3['high'],
                    'time': bar1['time']
                })

            # Bearish FVG: High of bar1 < Low of bar3
            if bar1['high'] < bar3['low']:
                bearish_fvgs.append({
                    'top': bar3['low'],
                    'bottom': bar1['high'],
                    'time': bar1['time']
                })

        return bullish_fvgs, bearish_fvgs

    def run_backtest(self, rates_1m, rates_15m, initial_capital=10000.0):
        """
        Runs the PO3 Strategy simulation on M1 and M15 rates lists.
        Rates entries must be dicts: {'time': datetime, 'open': float, 'high': float, 'low': float, 'close': float, 'volume': float}
        """
        capital = initial_capital
        trades = []
        equity_curve = [capital]

        if not rates_1m:
            return trades, capital, equity_curve

        # Group M1 rates by date
        days_data = {}
        for r in rates_1m:
            d = r['time'].date()
            if d not in days_data:
                days_data[d] = []
            days_data[d].append(r)

        for date_val, day_rates in days_data.items():
            session_start_time_dt = datetime.combine(date_val, time(self.session_start_hour, self.session_start_minute))
            accum_end_time_dt = session_start_time_dt + timedelta(minutes=self.accumulation_minutes)

            # Accumulation rates (10:00 - 10:30)
            accum_rates = [r for r in day_rates if session_start_time_dt <= r['time'] < accum_end_time_dt]
            if not accum_rates:
                continue

            accum_high = max(r['high'] for r in accum_rates)
            accum_low = min(r['low'] for r in accum_rates)

            # Post-accumulation rates (After 10:30)
            post_accum_rates = [r for r in day_rates if r['time'] >= accum_end_time_dt]
            if not post_accum_rates:
                continue

            # Prior 15M rates
            prior_15m = [r for r in rates_15m if r['time'] <= accum_end_time_dt]
            bull_15m, bear_15m = self.find_15m_fvgs(prior_15m)

            in_position = False
            position = None
            manipulation_low = accum_low
            manipulation_high = accum_high

            for i in range(2, len(post_accum_rates)):
                current_bar = post_accum_rates[i]
                current_time = current_bar['time']

                # Update manipulation extremes
                if current_bar['low'] < manipulation_low:
                    manipulation_low = current_bar['low']
                if current_bar['high'] > manipulation_high:
                    manipulation_high = current_bar['high']

                if in_position:
                    # Check position exit
                    if position['type'] == 'LONG':
                        if current_bar['low'] <= position['sl']:
                            pnl = (position['sl'] - position['entry']) * position['units']
                            capital += pnl
                            trades.append({
                                'entry_time': position['time'],
                                'exit_time': current_time,
                                'type': 'LONG',
                                'entry': position['entry'],
                                'exit': position['sl'],
                                'pnl': pnl,
                                'result': 'LOSS'
                            })
                            in_position = False
                        elif current_bar['high'] >= position['tp']:
                            pnl = (position['tp'] - position['entry']) * position['units']
                            capital += pnl
                            trades.append({
                                'entry_time': position['time'],
                                'exit_time': current_time,
                                'type': 'LONG',
                                'entry': position['entry'],
                                'exit': position['tp'],
                                'pnl': pnl,
                                'result': 'WIN'
                            })
                            in_position = False

                    elif position['type'] == 'SHORT':
                        if current_bar['high'] >= position['sl']:
                            pnl = (position['entry'] - position['sl']) * position['units']
                            capital += pnl
                            trades.append({
                                'entry_time': position['time'],
                                'exit_time': current_time,
                                'type': 'SHORT',
                                'entry': position['entry'],
                                'exit': position['sl'],
                                'pnl': pnl,
                                'result': 'LOSS'
                            })
                            in_position = False
                        elif current_bar['low'] <= position['tp']:
                            pnl = (position['entry'] - position['tp']) * position['units']
                            capital += pnl
                            trades.append({
                                'entry_time': position['time'],
                                'exit_time': current_time,
                                'type': 'SHORT',
                                'entry': position['entry'],
                                'exit': position['tp'],
                                'pnl': pnl,
                                'result': 'WIN'
                            })
                            in_position = False

                    equity_curve.append(capital)
                    continue

                # Signal Evaluation
                bar1 = post_accum_rates[i]      # completed bar
                bar3 = post_accum_rates[i - 2]

                # A. Bullish PO3 Setup (Sweep below Accumulation)
                if current_bar['low'] < accum_low:
                    # 1M Bullish FVG
                    if bar1['low'] > bar3['high']:
                        fvg_top = bar1['low']
                        fvg_bottom = bar3['high']

                        if current_bar['low'] <= fvg_top and current_bar['close'] >= fvg_bottom:
                            entry_price = current_bar['close']
                            sl_price = manipulation_low - self.sl_buffer_points
                            risk_dist = entry_price - sl_price

                            if risk_dist > 0:
                                tp_price = max(accum_high, entry_price + (risk_dist * self.risk_reward_ratio)) if self.use_accum_target else entry_price + (risk_dist * self.risk_reward_ratio)
                                risk_amount = capital * (self.risk_percent / 100.0)
                                units = risk_amount / risk_dist

                                position = {
                                    'type': 'LONG',
                                    'time': current_time,
                                    'entry': entry_price,
                                    'sl': sl_price,
                                    'tp': tp_price,
                                    'units': units
                                }
                                in_position = True

                # B. Bearish PO3 Setup (Sweep above Accumulation)
                elif current_bar['high'] > accum_high:
                    # 1M Bearish FVG
                    if bar1['high'] < bar3['low']:
                        fvg_top = bar3['low']
                        fvg_bottom = bar1['high']

                        if current_bar['high'] >= fvg_bottom and current_bar['close'] <= fvg_top:
                            entry_price = current_bar['close']
                            sl_price = manipulation_high + self.sl_buffer_points
                            risk_dist = sl_price - entry_price

                            if risk_dist > 0:
                                tp_price = min(accum_low, entry_price - (risk_dist * self.risk_reward_ratio)) if self.use_accum_target else entry_price - (risk_dist * self.risk_reward_ratio)
                                risk_amount = capital * (self.risk_percent / 100.0)
                                units = risk_amount / risk_dist

                                position = {
                                    'type': 'SHORT',
                                    'time': current_time,
                                    'entry': entry_price,
                                    'sl': sl_price,
                                    'tp': tp_price,
                                    'units': units
                                }
                                in_position = True

        return trades, capital, equity_curve


if __name__ == '__main__':
    print("Initializing PO3 Institutional Strategy Python Module...")
    random.seed(42)

    # Generate Synthetic M1 Data
    start_dt = datetime(2026, 1, 1, 9, 0)
    rates_1m = []
    current_price = 2000.0

    for i in range(300):
        t = start_dt + timedelta(minutes=i)
        o = current_price
        h = o + random.uniform(0.1, 1.0)
        l = o - random.uniform(0.1, 1.0)
        c = random.uniform(l, h)
        rates_1m.append({'time': t, 'open': o, 'high': h, 'low': l, 'close': c, 'volume': 100})
        current_price = c

    # Generate Synthetic M15 Data
    rates_15m = []
    for j in range(0, len(rates_1m), 15):
        chunk = rates_1m[j:j+15]
        if chunk:
            rates_15m.append({
                'time': chunk[0]['time'],
                'open': chunk[0]['open'],
                'high': max(c['high'] for c in chunk),
                'low': min(c['low'] for c in chunk),
                'close': chunk[-1]['close'],
                'volume': sum(c['volume'] for c in chunk)
            })

    strategy = PO3InstitutionalStrategy()
    trades, final_cap, equity = strategy.run_backtest(rates_1m, rates_15m)

    print(f"Backtest Completed successfully!")
    print(f"Initial Capital: $10,000.00 | Final Capital: ${final_cap:.2f}")
    print(f"Total Trades Executed: {len(trades)}")
