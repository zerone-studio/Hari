//+------------------------------------------------------------------+
//|                                         XAUUSD_Scalper_EA.mq5   |
//|                                  Copyright 2025, Expert Advisor |
//|                                  XAUUSD Scalper (VWAP + EMA)    |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025"
#property link      ""
#property version   "1.00"
#property description "MT5 Scalper EA for XAUUSD (Gold) utilizing VWAP and EMA."
#property description "Includes dynamic Risk Percentage position sizing and Risk-to-Reward ratio controls."

#include <Trade\Trade.mqh>

//--- Enums for Lot Sizing
enum ENUM_LOT_TYPE
  {
   LOT_TYPE_RISK_PERCENT, // Dynamic Lot Size based on Risk % of Equity
   LOT_TYPE_FIXED        // Fixed Lot Size
  };

//+------------------------------------------------------------------+
//| Input Parameters                                                 |
//+------------------------------------------------------------------+
//--- Risk & Lot Size Settings
input group "--- Risk & Money Management ---"
input ENUM_LOT_TYPE InpLotType          = LOT_TYPE_RISK_PERCENT; // Lot Sizing Type
input double        InpRiskPercent      = 1.0;  // Risk Percentage of Equity per Trade (%)
input double        InpFixedLotSize     = 0.1;  // Fixed Lot Size (if Fixed Lot Sizing chosen)
input int           InpStopLossPoints   = 300;  // Stop Loss in Points (e.g., 300 points = $3.00 on XAUUSD)
input double        InpRiskRewardRatio  = 2.0;  // Risk-to-Reward Ratio (TP = SL * RR Ratio)

//--- Indicator Settings (VWAP & EMA)
input group "--- Indicator Settings ---"
input int           InpEMAPeriod        = 50;   // EMA Period
input int           InpVWAPStartHour    = 0;    // VWAP Session Reset Hour
input int           InpVWAPStartMinute  = 0;    // VWAP Session Reset Minute

//--- Session & Operational Filters
input group "--- Session & Operational Settings ---"
input int           InpTradeStartHour   = 1;    // Trade Allowed Start Hour
input int           InpTradeEndHour     = 23;   // Trade Allowed End Hour
input bool          InpOneTradeAtATime  = true; // Allow max 1 open position at a time
input ulong         InpMagicNumber      = 888002; // Magic Number

//+------------------------------------------------------------------+
//| Global Variables                                                 |
//+------------------------------------------------------------------+
CTrade      trade;
int         g_emaHandle = INVALID_HANDLE;
datetime    g_lastBarTime = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(InpMagicNumber);

   // Initialize EMA Indicator Handle
   g_emaHandle = iMA(_Symbol, _Period, InpEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   if(g_emaHandle == INVALID_HANDLE)
     {
      Print("Error creating EMA indicator handle.");
      return(INIT_FAILED);
     }

   Print("XAUUSD Scalper EA initialized successfully. Magic Number: ", InpMagicNumber);
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(g_emaHandle != INVALID_HANDLE)
     {
      IndicatorRelease(g_emaHandle);
     }
   Print("XAUUSD Scalper EA Deinitialized. Reason: ", reason);
  }

//+------------------------------------------------------------------+
//| Get VWAP Session Start Datetime                                  |
//+------------------------------------------------------------------+
datetime GetVWAPSessionStart(datetime currentTime)
  {
   MqlDateTime dt;
   TimeToStruct(currentTime, dt);

   MqlDateTime startDt = dt;
   startDt.hour = InpVWAPStartHour;
   startDt.min = InpVWAPStartMinute;
   startDt.sec = 0;

   datetime startTime = StructToTime(startDt);
   if(currentTime < startTime)
     {
      startTime -= 86400; // Previous day's session start
     }
   return startTime;
  }

//+------------------------------------------------------------------+
//| Calculate dynamic Intraday VWAP                                  |
//+------------------------------------------------------------------+
bool CalculateVWAP(double &vwapValue)
  {
   datetime now = TimeCurrent();
   datetime sessionStart = GetVWAPSessionStart(now);

   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, _Period, sessionStart, now, rates);
   if(copied <= 0)
     {
      return false;
     }

   double cumulativePV = 0.0;
   double cumulativeVolume = 0.0;

   for(int i = 0; i < copied; i++)
     {
      double typicalPrice = (rates[i].high + rates[i].low + rates[i].close) / 3.0;
      double vol = (double)(rates[i].tick_volume > 0 ? rates[i].tick_volume : rates[i].real_volume);
      if(vol <= 0) vol = 1.0;

      cumulativePV += typicalPrice * vol;
      cumulativeVolume += vol;
     }

   if(cumulativeVolume <= 0)
     {
      return false;
     }

   vwapValue = cumulativePV / cumulativeVolume;
   return true;
  }

//+------------------------------------------------------------------+
//| Calculate Dynamic Lot Size based on Account Equity & Risk %      |
//+------------------------------------------------------------------+
double CalculateLotSize(double slPoints)
  {
   if(InpLotType == LOT_TYPE_FIXED)
     {
      return InpFixedLotSize;
     }

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskAmount = equity * (InpRiskPercent / 100.0);

   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   if(tickSize <= 0 || tickValue <= 0 || point <= 0 || slPoints <= 0)
     {
      return InpFixedLotSize;
     }

   // Loss value per 1 lot for slPoints
   double lossPerLot = (slPoints * point / tickSize) * tickValue;
   if(lossPerLot <= 0)
     {
      return InpFixedLotSize;
     }

   double calculatedLot = riskAmount / lossPerLot;

   // Normalize lot size according to broker specifications
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   calculatedLot = MathFloor(calculatedLot / lotStep) * lotStep;
   calculatedLot = MathMax(minLot, MathMin(maxLot, calculatedLot));

   return calculatedLot;
  }

//+------------------------------------------------------------------+
//| Count Open Positions for this Symbol & Magic Number              |
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
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   datetime now = TimeCurrent();

   // 1. Position limit check
   if(InpOneTradeAtATime && CountOpenPositions() > 0)
     {
      return;
     }

   // 2. Allowed session trading time check
   MqlDateTime dt;
   TimeToStruct(now, dt);
   if(dt.hour < InpTradeStartHour || dt.hour >= InpTradeEndHour)
     {
      return;
     }

   // 3. New bar check (Process signals on completed bar)
   datetime currentBarTime = iTime(_Symbol, _Period, 0);
   if(currentBarTime == g_lastBarTime)
     {
      return;
     }
   g_lastBarTime = currentBarTime;

   // 4. Calculate Intraday VWAP
   double vwap = 0.0;
   if(!CalculateVWAP(vwap))
     {
      return;
     }

   // 5. Get EMA Indicator Value for last completed bar (index 1)
   double emaValues[];
   ArraySetAsSeries(emaValues, true);
   if(CopyBuffer(g_emaHandle, 0, 1, 2, emaValues) < 2)
     {
      return;
     }
   double currentEMA = emaValues[0];  // index 1 in series (last completed bar)
   double previousEMA = emaValues[1]; // index 2 in series

   // Get close price of last completed bar
   double closeBar1 = iClose(_Symbol, _Period, 1);

   // 6. Calculate Dynamic Lot Size
   double lotSize = CalculateLotSize(InpStopLossPoints);

   // 7. Bullish Scalp Entry Signal:
   // - Close price above VWAP
   // - Close price above EMA
   // - EMA sloping upwards (currentEMA > previousEMA)
   bool bullishSignal = (closeBar1 > vwap) && (closeBar1 > currentEMA) && (currentEMA > previousEMA);

   if(bullishSignal)
     {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double sl = ask - (InpStopLossPoints * _Point);
      double tp = ask + (InpStopLossPoints * _Point * InpRiskRewardRatio);

      Print("XAUUSD Scalper BUY Signal! Entry: ", ask, " SL: ", sl, " TP: ", tp, " Lot: ", lotSize, " VWAP: ", vwap, " EMA: ", currentEMA);
      trade.Buy(lotSize, _Symbol, ask, sl, tp, "XAUUSD Scalper Buy");
      return;
     }

   // 8. Bearish Scalp Entry Signal:
   // - Close price below VWAP
   // - Close price below EMA
   // - EMA sloping downwards (currentEMA < previousEMA)
   bool bearishSignal = (closeBar1 < vwap) && (closeBar1 < currentEMA) && (currentEMA < previousEMA);

   if(bearishSignal)
     {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double sl = bid + (InpStopLossPoints * _Point);
      double tp = bid - (InpStopLossPoints * _Point * InpRiskRewardRatio);

      Print("XAUUSD Scalper SELL Signal! Entry: ", bid, " SL: ", sl, " TP: ", tp, " Lot: ", lotSize, " VWAP: ", vwap, " EMA: ", currentEMA);
      trade.Sell(lotSize, _Symbol, bid, sl, tp, "XAUUSD Scalper Sell");
      return;
     }
  }
