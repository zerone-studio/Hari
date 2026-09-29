//+------------------------------------------------------------------+
//|                                         PO3_Institutional_EA.mq5 |
//|                                  Copyright 2025, Expert Advisor |
//|                     Institutional Power of 3 (PO3) Strategy EA |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025"
#property link      ""
#property version   "1.00"
#property description "MT5 Expert Advisor based on the Institutional Power of 3 (PO3) Strategy."
#property description "Combines 4H Accumulation/Manipulation/Distribution with 15M HTF FVG sweeps & 1M LTF execution."

#include <Trade\Trade.mqh>

//--- Enums
enum ENUM_PO3_PHASE
  {
   PO3_PHASE_IDLE,          // Waiting for 10:00 AM EST session open
   PO3_PHASE_ACCUMULATION,  // Building Accumulation range (10:00 - 10:30)
   PO3_PHASE_MANIPULATION,  // Sweeping HTF 15M FVG (forming 4H wick)
   PO3_PHASE_DISTRIBUTION   // Trade executed / Distribution phase
  };

enum ENUM_TP_TARGET
  {
   TP_ACCUMULATION_LEVELS, // Target Accumulation High (Long) / Low (Short)
   TP_RISK_REWARD_RATIO    // Target fixed Risk-to-Reward Ratio
  };

//+------------------------------------------------------------------+
//| Input Parameters                                                 |
//+------------------------------------------------------------------+
//--- PO3 Session & Timing Inputs
input group "--- PO3 Session & Timing ---"
input int             InpPO3StartHour        = 10;    // PO3 Session Start Hour (10:00 AM EST)
input int             InpPO3StartMinute      = 0;     // PO3 Session Start Minute
input int             InpAccumulationMin     = 30;    // Accumulation Phase Duration in Minutes
input int             InpMaxSessionDuration  = 240;   // Max Session Duration in Minutes (4H Candle)

//--- Strategy & FVG Settings
input group "--- Strategy & FVG Settings ---"
input int             InpHTFLookbackBars     = 50;    // HTF (15M) Lookback Bars for FVG detection
input int             InpSLBufferPoints      = 50;    // Stop Loss Buffer below Manipulation Wick (points)

//--- Trade Management & Risk Sizing
input group "--- Risk & Trade Management ---"
input double          InpRiskPercent         = 1.0;   // Risk Percentage of Account Equity (%)
input bool            InpUseRiskPercent      = true;  // Use Risk % (true) or Fixed Lot Size (false)
input double          InpFixedLotSize        = 0.1;   // Fixed Lot Size
input ENUM_TP_TARGET  InpTPTargetMode        = TP_ACCUMULATION_LEVELS; // Take Profit Mode
input double          InpRiskRewardRatio     = 1.5;   // Risk-to-Reward Ratio (if TP_RISK_REWARD_RATIO)
input ulong           InpMagicNumber         = 999003;// Magic Number

//+------------------------------------------------------------------+
//| Fair Value Gap Structure                                         |
//+------------------------------------------------------------------+
struct FairValueGap
  {
   bool     isValid;
   bool     isBullish;   // true = Bullish FVG, false = Bearish FVG
   double   topPrice;
   double   bottomPrice;
   datetime time;
  };

//+------------------------------------------------------------------+
//| Global Variables                                                 |
//+------------------------------------------------------------------+
CTrade            trade;
ENUM_PO3_PHASE    g_po3Phase = PO3_PHASE_IDLE;
datetime          g_sessionStartTime = 0;
datetime          g_lastBarTime = 0;

// Accumulation & Manipulation Tracker
double            g_accumHigh = 0.0;
double            g_accumLow = 0.0;
double            g_manipulationLow = 0.0;
double            g_manipulationHigh = 0.0;

FairValueGap      g_target15MFVG;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(InpMagicNumber);
   Print("PO3 Institutional Strategy EA Initialized. Magic Number: ", InpMagicNumber);
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   Print("PO3 Institutional Strategy EA Deinitialized. Reason: ", reason);
  }

//+------------------------------------------------------------------+
//| Calculate Dynamic Lot Size based on Account Equity & SL Points   |
//+------------------------------------------------------------------+
double CalculateLotSize(double slDistancePrice)
  {
   if(!InpUseRiskPercent || slDistancePrice <= 0)
     {
      return InpFixedLotSize;
     }

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskAmount = equity * (InpRiskPercent / 100.0);

   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);

   if(tickSize <= 0 || tickValue <= 0) return InpFixedLotSize;

   double lossPerLot = (slDistancePrice / tickSize) * tickValue;
   if(lossPerLot <= 0) return InpFixedLotSize;

   double calculatedLot = riskAmount / lossPerLot;

   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   calculatedLot = MathFloor(calculatedLot / lotStep) * lotStep;
   return MathMax(minLot, MathMin(maxLot, calculatedLot));
  }

//+------------------------------------------------------------------+
//| Count Open Positions for this Symbol & Magic                     |
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

//+------------------------------------------------------------------+
//| Find HTF (15M) Fair Value Gap (FVG)                              |
//+------------------------------------------------------------------+
bool Find15MFairValueGap(bool lookForBullish, FairValueGap &fvg)
  {
   fvg.isValid = false;
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M15, 0, InpHTFLookbackBars, rates);
   if(copied < 5) return false;

   for(int i = 1; i < copied - 2; i++)
     {
      if(lookForBullish)
        {
         // Bullish 15M FVG: Low of candle i > High of candle i+2
         if(rates[i+2].high < rates[i].low && rates[i].low < g_accumLow)
           {
            fvg.isValid = true;
            fvg.isBullish = true;
            fvg.topPrice = rates[i].low;
            fvg.bottomPrice = rates[i+2].high;
            fvg.time = rates[i].time;
            return true;
           }
        }
      else
        {
         // Bearish 15M FVG: High of candle i < Low of candle i+2
         if(rates[i+2].low > rates[i].high && rates[i].high > g_accumHigh)
           {
            fvg.isValid = true;
            fvg.isBullish = false;
            fvg.topPrice = rates[i+2].low;
            fvg.bottomPrice = rates[i].high;
            fvg.time = rates[i].time;
            return true;
           }
        }
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Find LTF (1M) Bullish / Bearish FVG                              |
//+------------------------------------------------------------------+
bool Find1MBullishFVG(const MqlRates &rates[], FairValueGap &fvg)
  {
   fvg.isValid = false;
   int total = ArraySize(rates);
   for(int i = 1; i <= 10 && (i + 2) < total; i++)
     {
      if(rates[i+2].high < rates[i].low)
        {
         fvg.isValid = true;
         fvg.isBullish = true;
         fvg.topPrice = rates[i].low;
         fvg.bottomPrice = rates[i+2].high;
         fvg.time = rates[i].time;
         return true;
        }
     }
   return false;
  }

bool Find1MBearishFVG(const MqlRates &rates[], FairValueGap &fvg)
  {
   fvg.isValid = false;
   int total = ArraySize(rates);
   for(int i = 1; i <= 10 && (i + 2) < total; i++)
     {
      if(rates[i+2].low > rates[i].high)
        {
         fvg.isValid = true;
         fvg.isBullish = false;
         fvg.topPrice = rates[i+2].low;
         fvg.bottomPrice = rates[i].high;
         fvg.time = rates[i].time;
         return true;
        }
     }
   return false;
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);

   // 1. Check for PO3 Session Reset (at 10:00 AM EST)
   if(dt.hour == InpPO3StartHour && dt.min == InpPO3StartMinute && g_po3Phase != PO3_PHASE_ACCUMULATION)
     {
      g_po3Phase = PO3_PHASE_ACCUMULATION;
      g_sessionStartTime = now;
      g_accumHigh = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      g_accumLow  = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      g_manipulationLow  = g_accumLow;
      g_manipulationHigh = g_accumHigh;
      g_target15MFVG.isValid = false;
      Print("PO3 Session Started at ", TimeToString(now), ". Phase set to ACCUMULATION.");
     }

   // 2. Process Accumulation Phase (First 30 minutes)
   if(g_po3Phase == PO3_PHASE_ACCUMULATION)
     {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

      if(ask > g_accumHigh) g_accumHigh = ask;
      if(bid < g_accumLow)  g_accumLow  = bid;

      // Transition to Manipulation Phase after Accumulation Duration (e.g. 30 mins)
      if(now >= g_sessionStartTime + (InpAccumulationMin * 60))
        {
         g_po3Phase = PO3_PHASE_MANIPULATION;
         g_manipulationLow  = g_accumLow;
         g_manipulationHigh = g_accumHigh;

         Print("Accumulation Phase Complete. Range High: ", g_accumHigh, " Low: ", g_accumLow, ". Transitioning to MANIPULATION.");
        }
      return;
     }

   // 3. Process Manipulation Phase & Execution Logic
   if(g_po3Phase == PO3_PHASE_MANIPULATION)
     {
      if(CountOpenPositions() > 0) return; // Only 1 trade per PO3 session

      // Check session expiry
      if(now >= g_sessionStartTime + (InpMaxSessionDuration * 60))
        {
         g_po3Phase = PO3_PHASE_IDLE;
         return;
        }

      // Track extreme manipulation wicks
      double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(currentBid < g_manipulationLow)  g_manipulationLow  = currentBid;
      if(currentAsk > g_manipulationHigh) g_manipulationHigh = currentAsk;

      // Check new 1M bar completion
      datetime currentBarTime = iTime(_Symbol, PERIOD_M1, 0);
      if(currentBarTime == g_lastBarTime) return;
      g_lastBarTime = currentBarTime;

      MqlRates rates1M[];
      ArraySetAsSeries(rates1M, true);
      if(CopyRates(_Symbol, PERIOD_M1, 0, 20, rates1M) < 15) return;

      // A. BULLISH PO3 MODEL (Sweep below Accumulation into 15M FVG + 1M FVG Respect)
      if(!g_target15MFVG.isValid)
        {
         Find15MFairValueGap(true, g_target15MFVG); // Find Bullish 15M FVG below Accumulation
        }

      // If price swept below Accumulation Low (and into 15M FVG if found)
      if(rates1M[1].low < g_accumLow)
        {
         FairValueGap m1BullFVG;
         if(Find1MBullishFVG(rates1M, m1BullFVG))
           {
            // 1M Retrace & Respect check: Low pulled back into 1M FVG but close remained above bottom
            if(rates1M[1].low <= m1BullFVG.topPrice && rates1M[1].close >= m1BullFVG.bottomPrice)
              {
               double entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
               double slPrice = g_manipulationLow - (InpSLBufferPoints * _Point);
               double slDist = entryPrice - slPrice;
               if(slDist > 0)
                 {
                  double tpPrice = 0.0;
                  if(InpTPTargetMode == TP_ACCUMULATION_LEVELS)
                    {
                     tpPrice = g_accumHigh;
                     if(tpPrice <= entryPrice) tpPrice = entryPrice + (slDist * InpRiskRewardRatio);
                    }
                  else
                    {
                     tpPrice = entryPrice + (slDist * InpRiskRewardRatio);
                    }

                  double lot = CalculateLotSize(slDist);
                  Print("PO3 BULLISH ENTRY! Entry: ", entryPrice, " SL: ", slPrice, " TP: ", tpPrice, " Lot: ", lot);
                  if(trade.Buy(lot, _Symbol, entryPrice, slPrice, tpPrice, "PO3 Institutional Bullish"))
                    {
                     g_po3Phase = PO3_PHASE_DISTRIBUTION;
                     return;
                    }
                 }
              }
           }
        }

      // B. BEARISH PO3 MODEL (Sweep above Accumulation into 15M FVG + 1M FVG Respect)
      FairValueGap target15MBear;
      if(Find15MFairValueGap(false, target15MBear))
        {
         if(rates1M[1].high > g_accumHigh)
           {
            FairValueGap m1BearFVG;
            if(Find1MBearishFVG(rates1M, m1BearFVG))
              {
               // 1M Retrace & Respect check: High pulled back into 1M FVG but close remained below top
               if(rates1M[1].high >= m1BearFVG.bottomPrice && rates1M[1].close <= m1BearFVG.topPrice)
                 {
                  double entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
                  double slPrice = g_manipulationHigh + (InpSLBufferPoints * _Point);
                  double slDist = slPrice - entryPrice;
                  if(slDist > 0)
                    {
                     double tpPrice = 0.0;
                     if(InpTPTargetMode == TP_ACCUMULATION_LEVELS)
                       {
                        tpPrice = g_accumLow;
                        if(tpPrice >= entryPrice) tpPrice = entryPrice - (slDist * InpRiskRewardRatio);
                       }
                     else
                       {
                        tpPrice = entryPrice - (slDist * InpRiskRewardRatio);
                       }

                     double lot = CalculateLotSize(slDist);
                     Print("PO3 BEARISH ENTRY! Entry: ", entryPrice, " SL: ", slPrice, " TP: ", tpPrice, " Lot: ", lot);
                     if(trade.Sell(lot, _Symbol, entryPrice, slPrice, tpPrice, "PO3 Institutional Bearish"))
                       {
                        g_po3Phase = PO3_PHASE_DISTRIBUTION;
                        return;
                       }
                    }
                 }
              }
           }
        }
     }
  }
