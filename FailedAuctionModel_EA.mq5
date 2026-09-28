//+------------------------------------------------------------------+
//|                                       FailedAuctionModel_EA.mq5 |
//|                                  Copyright 2025, Expert Advisor |
//|                                 Failed Auction Model Strategy   |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025"
#property link      ""
#property version   "1.00"
#property description "MT5 Expert Advisor based on the Failed Auction Model (Auction Market Theory)."
#property description "Trades extremes (VAH/VAL) back to fair value using FVG Inversion displacement trigger."

#include <Trade\Trade.mqh>

//--- Enums
enum ENUM_TP_MODE
  {
   TP_MODE_STATIC_RR,  // Static Risk-to-Reward Ratio (e.g., 1.5R)
   TP_MODE_POC_TARGET  // Take Profit at Point of Control (POC)
  };

//+------------------------------------------------------------------+
//| Input Parameters                                                 |
//+------------------------------------------------------------------+
//--- Volume Profile Settings
input group "--- Volume Profile Settings ---"
input int      InpVPStartHour       = 18;     // Volume Profile Start Hour (e.g. 18 for Globex)
input int      InpVPStartMinute     = 0;      // Volume Profile Start Minute
input double   InpValueAreaPercent  = 70.0;   // Value Area Percentage (e.g. 70.0%)
input double   InpRowSizePoints     = 100.0;  // Volume Profile Row Size in Points (Step size)

//--- Strategy & Entry Filters
input group "--- Strategy & Entry Filters ---"
input double   InpPOCFilterDistance = 50.0;   // Min distance from POC in points (Avoid Fair Value)
input int      InpMaxBarsLookback   = 30;     // Max bars back to identify extreme high/low failure
input int      InpFVGMaxAgeBars     = 10;     // Max age of FVG in bars before displacement trigger

//--- Trade Management & Risk
input group "--- Trade Management & Risk ---"
input double   InpLotSize           = 0.1;    // Fixed Lot Size
input int      InpStopLossPoints    = 150;    // Static Stop Loss in Points
input ENUM_TP_MODE InpTPMode        = TP_MODE_STATIC_RR; // Take Profit Mode
input double   InpTPRatio           = 1.5;    // Static Reward-to-Risk Ratio (for TP_MODE_STATIC_RR)
input ulong    InpMagicNumber       = 777001; // Magic Number

//--- Operational & Session Logic
input group "--- Session & Execution Settings ---"
input int      InpTradeStartHour    = 0;      // Trade Allowed Start Hour
input int      InpTradeStartMinute  = 0;      // Trade Allowed Start Minute
input int      InpTradeEndHour      = 23;     // Trade Allowed End Hour
input int      InpTradeEndMinute    = 0;      // Trade Allowed End Minute
input bool     InpIntradayOnly      = true;   // Close all positions before day end
input int      InpForceCloseHour    = 23;     // Force Close Hour
input int      InpForceCloseMinute  = 50;     // Force Close Minute

//+------------------------------------------------------------------+
//| Global Variables & Data Structures                               |
//+------------------------------------------------------------------+
CTrade      trade;
datetime    g_lastBarTime = 0;

// Dynamic Volume Profile Output Levels
double      g_pocPrice = 0.0;
double      g_vahPrice = 0.0;
double      g_valPrice = 0.0;

// Volume Profile Bucket Structure
struct VolumeBucket
  {
   double price;
   double volume;
  };

// Fair Value Gap Structure
struct FairValueGap
  {
   bool   isValid;
   bool   isBullish;   // true = Bullish FVG, false = Bearish FVG
   double topPrice;    // For Bullish: Low of bar i. For Bearish: Low of bar i+2
   double bottomPrice; // For Bullish: High of bar i+2. For Bearish: High of bar i
   datetime barTime;
  };

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(InpMagicNumber);
   Print("Failed Auction Model EA Initialized successfully.");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   Print("Failed Auction Model EA Deinitialized. Reason: ", reason);
  }

//+------------------------------------------------------------------+
//| Get the start datetime of the current Volume Profile session     |
//+------------------------------------------------------------------+
datetime GetSessionStartTime(datetime currentTime)
  {
   MqlDateTime dt;
   TimeToStruct(currentTime, dt);

   MqlDateTime sessionDt = dt;
   sessionDt.hour = InpVPStartHour;
   sessionDt.min = InpVPStartMinute;
   sessionDt.sec = 0;

   datetime sessionTime = StructToTime(sessionDt);

   // If current time is earlier than today's session start time,
   // the session started on the previous calendar day.
   if(currentTime < sessionTime)
     {
      sessionTime -= 86400; // subtract 24 hours (1 day)
     }

   return sessionTime;
  }

//+------------------------------------------------------------------+
//| Calculate dynamic Volume Profile (POC, VAH, VAL)                 |
//+------------------------------------------------------------------+
bool CalculateVolumeProfile(double &outPOC, double &outVAH, double &outVAL)
  {
   datetime now = TimeCurrent();
   datetime sessionStart = GetSessionStartTime(now);

   // Copy M1 bars from sessionStart to current time
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, PERIOD_M1, sessionStart, now, rates);
   if(copied <= 0)
     {
      return false;
     }

   double step = InpRowSizePoints * _Point;
   if(step <= 0) step = _Point * 10;

   // Find overall min and max price in session rates
   double minPrice = rates[0].low;
   double maxPrice = rates[0].high;
   for(int i = 1; i < copied; i++)
     {
      if(rates[i].low < minPrice) minPrice = rates[i].low;
      if(rates[i].high > maxPrice) maxPrice = rates[i].high;
     }

   long minBucket = (long)MathFloor(minPrice / step);
   long maxBucket = (long)MathFloor(maxPrice / step);
   int numBuckets = (int)(maxBucket - minBucket + 1);

   if(numBuckets <= 0) return false;

   double volumes[];
   ArrayResize(volumes, numBuckets);
   ArrayInitialize(volumes, 0.0);

   double totalVolume = 0.0;

   for(int i = 0; i < copied; i++)
     {
      double vol = (double)(rates[i].tick_volume > 0 ? rates[i].tick_volume : rates[i].real_volume);
      if(vol <= 0) vol = 1.0;

      long lowB = (long)MathFloor(rates[i].low / step);
      long highB = (long)MathFloor(rates[i].high / step);

      long rangeBuckets = highB - lowB + 1;
      double volPerBucket = vol / (double)rangeBuckets;

      for(long b = lowB; b <= highB; b++)
        {
         int idx = (int)(b - minBucket);
         if(idx >= 0 && idx < numBuckets)
           {
            volumes[idx] += volPerBucket;
            totalVolume += volPerBucket;
           }
        }
     }

   if(totalVolume <= 0) return false;

   // 1. Find POC (bucket with maximum volume)
   int pocIdx = 0;
   double maxVol = volumes[0];
   for(int j = 1; j < numBuckets; j++)
     {
      if(volumes[j] > maxVol)
        {
         maxVol = volumes[j];
         pocIdx = j;
        }
     }

   outPOC = (minBucket + pocIdx) * step + (step * 0.5);

   // 2. Value Area Calculation (VAH / VAL)
   double targetVA = totalVolume * (InpValueAreaPercent / 100.0);
   double vaVol = volumes[pocIdx];

   int upperIdx = pocIdx;
   int lowerIdx = pocIdx;

   while(vaVol < targetVA && (upperIdx < numBuckets - 1 || lowerIdx > 0))
     {
      double nextUpperVol = (upperIdx < numBuckets - 1) ? volumes[upperIdx + 1] : 0.0;
      double nextLowerVol = (lowerIdx > 0) ? volumes[lowerIdx - 1] : 0.0;

      if(nextUpperVol >= nextLowerVol && upperIdx < numBuckets - 1)
        {
         upperIdx++;
         vaVol += volumes[upperIdx];
        }
      else if(lowerIdx > 0)
        {
         lowerIdx--;
         vaVol += volumes[lowerIdx];
        }
      else if(upperIdx < numBuckets - 1)
        {
         upperIdx++;
         vaVol += volumes[upperIdx];
        }
     }

   outVAL = (minBucket + lowerIdx) * step;
   outVAH = (minBucket + upperIdx + 1) * step;

   return true;
  }

//+------------------------------------------------------------------+
//| Check if time is within allowed trading hours                    |
//+------------------------------------------------------------------+
bool IsWithinTradeSession(datetime currentTime)
  {
   MqlDateTime dt;
   TimeToStruct(currentTime, dt);

   int currentMinutes = dt.hour * 60 + dt.min;
   int startMinutes   = InpTradeStartHour * 60 + InpTradeStartMinute;
   int endMinutes     = InpTradeEndHour * 60 + InpTradeEndMinute;

   if(startMinutes <= endMinutes)
     {
      return (currentMinutes >= startMinutes && currentMinutes <= endMinutes);
     }
   else // Spans midnight (e.g. 18:00 to 05:00)
     {
      return (currentMinutes >= startMinutes || currentMinutes <= endMinutes);
     }
  }

//+------------------------------------------------------------------+
//| Check if price recently probed extreme (VAL or VAH)             |
//+------------------------------------------------------------------+
bool HasRecentProbedVAL(const MqlRates &rates[], int lookback)
  {
   int limit = MathMin(lookback, ArraySize(rates));
   for(int i = 1; i < limit; i++)
     {
      if(rates[i].low < g_valPrice)
         return true;
     }
   return false;
  }

bool HasRecentProbedVAH(const MqlRates &rates[], int lookback)
  {
   int limit = MathMin(lookback, ArraySize(rates));
   for(int i = 1; i < limit; i++)
     {
      if(rates[i].high > g_vahPrice)
         return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
//| FVG INVERSION & EXHAUSTION DISPLACEMENT LOGIC                    |
//+------------------------------------------------------------------+
/*
 * FVG INVERSION & FAILED AUCTION THEORY:
 *
 * 1. Extreme Phase (Probing VAH/VAL):
 *    In Auction Market Theory, price moving beyond the Value Area High (VAH) or
 *    Value Area Low (VAL) is an attempt to seek new buyers/sellers outside fair value.
 *
 * 2. Exhaustion / Catalyst Phase (Fair Value Gap Formation):
 *    If the market lacks volume conviction at the extreme, price stalls or U-turns.
 *    During this reversal attempt, a Fair Value Gap (FVG) forms across 3 candles:
 *    - Bullish FVG: Low of Candle 1 > High of Candle 3 (Gap between High[i+2] and Low[i])
 *    - Bearish FVG: High of Candle 1 < Low of Candle 3 (Gap between Low[i+2] and High[i])
 *
 * 3. Displacement Trigger (FVG Inversion):
 *    The trade signal is triggered when a displacement candle (strong body candle)
 *    closes above/below the FVG boundaries, "inverting" the gap.
 *    - Long Entry Signal:
 *      * Price was recently below VAL (failed lower auction).
 *      * A Bullish FVG formed.
 *      * Candle 1 closes ABOVE the top of the FVG (Low of Candle 1), confirming strong displacement back into the value area.
 *    - Short Entry Signal:
 *      * Price was recently above VAH (failed higher auction).
 *      * A Bearish FVG formed.
 *      * Candle 1 closes BELOW the bottom of the FVG (High of Candle 1), confirming strong displacement back into the value area.
 */

bool FindRecentBullishFVG(const MqlRates &rates[], int maxAge, FairValueGap &fvg)
  {
   fvg.isValid = false;
   int total = ArraySize(rates);
   // Look for FVG in completed bars (index >= 2)
   for(int i = 2; i <= maxAge && (i + 2) < total; i++)
     {
      if(rates[i+2].high < rates[i].low) // Bullish FVG
        {
         fvg.isValid = true;
         fvg.isBullish = true;
         fvg.topPrice = rates[i].low;
         fvg.bottomPrice = rates[i+2].high;
         fvg.barTime = rates[i].time;
         return true;
        }
     }
   return false;
  }

bool FindRecentBearishFVG(const MqlRates &rates[], int maxAge, FairValueGap &fvg)
  {
   fvg.isValid = false;
   int total = ArraySize(rates);
   for(int i = 2; i <= maxAge && (i + 2) < total; i++)
     {
      if(rates[i+2].low > rates[i].high) // Bearish FVG
        {
         fvg.isValid = true;
         fvg.isBullish = false;
         fvg.topPrice = rates[i+2].low;
         fvg.bottomPrice = rates[i].high;
         fvg.barTime = rates[i].time;
         return true;
        }
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Position Management Helpers                                      |
//+------------------------------------------------------------------+
int CountOpenPositions()
  {
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
        {
         if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
            PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
           {
            count++;
           }
        }
     }
   return count;
  }

void CloseAllPositions()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
        {
         if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
            PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
           {
            trade.PositionClose(ticket);
           }
        }
     }
  }

bool ShouldForceClose(datetime currentTime)
  {
   if(!InpIntradayOnly) return false;

   MqlDateTime dt;
   TimeToStruct(currentTime, dt);
   int currentMinutes = dt.hour * 60 + dt.min;
   int forceMinutes = InpForceCloseHour * 60 + InpForceCloseMinute;

   return (currentMinutes >= forceMinutes);
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   datetime now = TimeCurrent();

   // Recalculate Volume Profile levels dynamically
   if(!CalculateVolumeProfile(g_pocPrice, g_vahPrice, g_valPrice))
     {
      return;
     }

   // 1. Intraday Force Close Check (No overnight holds)
   if(ShouldForceClose(now))
     {
      CloseAllPositions();
      return;
     }

   // 2. Do not open new positions if already in a trade ("Set and Forget")
   if(CountOpenPositions() > 0)
     {
      return;
     }

   // 3. Check allowed trading hours session
   if(!IsWithinTradeSession(now))
     {
      return;
     }

   // 4. Process entry signals on new M1 bar open
   datetime currentBarTime = iTime(_Symbol, PERIOD_M1, 0);
   if(currentBarTime == g_lastBarTime)
     {
      return; // Wait for new M1 bar completion
     }
   g_lastBarTime = currentBarTime;

   // Get completed M1 rates
   MqlRates rates[];
   ArraySetAsSeries(rates, true); // index 1 is last completed bar
   int copied = CopyRates(_Symbol, PERIOD_M1, 0, InpMaxBarsLookback + 5, rates);
   if(copied < InpMaxBarsLookback)
     {
      return;
     }

   // 5. Avoid Fair Value Filter: Ensure price is not consolidating tightly around POC
   double closePriceBar1 = rates[1].close;
   double distFromPOC = MathAbs(closePriceBar1 - g_pocPrice);
   if(distFromPOC < InpPOCFilterDistance * _Point)
     {
      return; // Price is consolidating at POC (Fair Value agreement), filter out trade
     }

   // 6. LONG ENTRY CHECK (Failed Auction below VAL)
   if(HasRecentProbedVAL(rates, InpMaxBarsLookback))
     {
      FairValueGap bullFVG;
      if(FindRecentBullishFVG(rates, InpFVGMaxAgeBars, bullFVG))
        {
         // Displacement Trigger: Bar 1 closed above the Bullish FVG top with strong bullish close
         if(rates[1].close > bullFVG.topPrice && rates[1].close > rates[1].open)
           {
            double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
            double sl = ask - (InpStopLossPoints * _Point);
            double tp = 0.0;

            if(InpTPMode == TP_MODE_STATIC_RR)
              {
               tp = ask + (InpStopLossPoints * _Point * InpTPRatio);
              }
            else if(InpTPMode == TP_MODE_POC_TARGET)
              {
               tp = g_pocPrice;
               if(tp <= ask) // Fallback if POC is below ask
                 {
                  tp = ask + (InpStopLossPoints * _Point * InpTPRatio);
                 }
              }

            Print("Opening LONG trade - Failed Auction at VAL with Bullish FVG Inversion. Entry: ", ask, " SL: ", sl, " TP: ", tp);
            trade.Buy(InpLotSize, _Symbol, ask, sl, tp, "Failed Auction Model Long");
            return;
           }
        }
     }

   // 7. SHORT ENTRY CHECK (Failed Auction above VAH)
   if(HasRecentProbedVAH(rates, InpMaxBarsLookback))
     {
      FairValueGap bearFVG;
      if(FindRecentBearishFVG(rates, InpFVGMaxAgeBars, bearFVG))
        {
         // Displacement Trigger: Bar 1 closed below the Bearish FVG bottom with strong bearish close
         if(rates[1].close < bearFVG.bottomPrice && rates[1].close < rates[1].open)
           {
            double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
            double sl = bid + (InpStopLossPoints * _Point);
            double tp = 0.0;

            if(InpTPMode == TP_MODE_STATIC_RR)
              {
               tp = bid - (InpStopLossPoints * _Point * InpTPRatio);
              }
            else if(InpTPMode == TP_MODE_POC_TARGET)
              {
               tp = g_pocPrice;
               if(tp >= bid) // Fallback if POC is above bid
                 {
                  tp = bid - (InpStopLossPoints * _Point * InpTPRatio);
                 }
              }

            Print("Opening SHORT trade - Failed Auction at VAH with Bearish FVG Inversion. Entry: ", bid, " SL: ", sl, " TP: ", tp);
            trade.Sell(InpLotSize, _Symbol, bid, sl, tp, "Failed Auction Model Short");
            return;
           }
        }
     }
  }
