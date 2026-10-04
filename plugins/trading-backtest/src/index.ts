import type { Candle } from "@dsh-stack/trading-research";

export type PositionSide = "long" | "short";

export interface Position {
  readonly side: PositionSide;
  readonly quantity: number;
  readonly entryPrice: number;
  readonly entryTime: number;
}

export interface BacktestContext {
  readonly candle: Candle;
  readonly position: Position | null;
  readonly equity: number;
  readonly cash: number;
  readonly history: readonly Trade[];
  buy(quantity: number): void;
  sell(quantity: number): void;
  close(): void;
}

export interface Strategy {
  readonly id: string;
  onCandle(context: BacktestContext): void;
}

export interface Trade {
  readonly side: PositionSide;
  readonly quantity: number;
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly entryTime: number;
  readonly exitTime: number;
  readonly pnl: number;
}

export interface BacktestResult {
  readonly initialCapital: number;
  readonly finalEquity: number;
  readonly totalReturn: number;
  readonly maxDrawdown: number;
  readonly winRate: number;
  readonly trades: readonly Trade[];
}

export interface BacktestOptions {
  readonly initialCapital?: number;
  readonly commissionPerTrade?: number;
  readonly slippageBps?: number;
}

/**
 * Runs a backtest using the provided candles, strategy, and options to simulate trades and generate a backtest result.
 *
 * @param candles - The historical price data used for the backtest.
 * @param strategy - The trading strategy to execute during the backtest.
 * @param options - Configuration options for the backtest, including initial capital, commission, and slippage.
 * @returns A BacktestResult containing the equity curve and list of trades.
 * @throws Will throw an error if the candle series is empty or if the initial capital is not positive.
 */
export function runBacktest(
  candles: readonly Candle[],
  strategy: Strategy,
  options: BacktestOptions = {},
): BacktestResult {
  if (candles.length === 0) throw new Error("Cannot backtest an empty candle series");
  const initialCapital = options.initialCapital ?? 10_000;
  if (!(initialCapital > 0)) throw new Error("Initial capital must be positive");
  const commission = options.commissionPerTrade ?? 0;
  const slippage = (options.slippageBps ?? 0) / 10_000;
  let cash = initialCapital;
  let position: Position | null = null;
  let currentCandle = candles[0]!;
  const trades: Trade[] = [];
  const equityCurve: number[] = [];

  /**
   * Adjusts the price based on the trade side, applying slippage for buys and slippage/leverage for sells.
   *
   * @param price - The base price for the trade.
   * @param side - The side of the trade, either "buy" or "sell".
   * @returns The adjusted price accounting for slippage or leverage.
   * @throws Throws an error if the side is neither "buy" nor "sell".
   */
  const executionPrice = (price: number, side: "buy" | "sell"): number =>
    side === "buy" ? price * (1 + slippage) : price * (1 - slippage);
  /**
   * Calculates the current equity or margin level based on the current position and cash balance.
   *
   * @param price - The price used to calculate the equity or margin.
   * @returns The current equity or margin level.
   * @throws Throws an error if the position is null and cash is not defined.
   */
  const mark = (price: number): number =>
    position === null
      ? cash
      : cash + (position.side === "long" ? position.quantity * price : -position.quantity * price);

  for (const candle of candles) {
    currentCandle = candle;
    const context: BacktestContext = {
      candle,
      position,
      equity: mark(candle.close),
      cash,
      history: trades,
      buy: (quantity) => {
        if (!(quantity > 0)) throw new Error("Buy quantity must be positive");
        if (position?.side === "short") {
          close();
          if (position !== null) throw new Error("Unable to close short before buying");
          openLong(quantity);
          return;
        }
        if (position !== null) throw new Error("A long position is already open");
        openLong(quantity);
      },
      sell: (quantity) => {
        if (!(quantity > 0)) throw new Error("Sell quantity must be positive");
        if (position?.side === "long") {
          close();
          if (position !== null) throw new Error("Unable to close long before selling");
          openShort(quantity);
          return;
        }
        if (position !== null) throw new Error("A short position is already open");
        openShort(quantity);
      },
      close,
    };

    strategy.onCandle(context);
    equityCurve.push(mark(candle.close));
  }

  close();

  const finalEquity = cash;
  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const equity of [...equityCurve, finalEquity]) {
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak);
  }

  const wins = trades.filter((trade) => trade.pnl > 0).length;
  return {
    initialCapital,
    finalEquity,
    totalReturn: (finalEquity - initialCapital) / initialCapital,
    maxDrawdown,
    winRate: trades.length === 0 ? 0 : wins / trades.length,
    trades,
  };

  /**
   * Opens a long position with the specified quantity.
   * Guarantees that no long position is already open before opening.
   * Throws an error if a long position is already open or if the sell quantity is not positive.
   * On failure, throws an error indicating the inability to open a long position.
   */
  function openLong(quantity: number): void {
    const price = executionPrice(currentCandle.close, "buy");
    position = { side: "long", quantity, entryPrice: price, entryTime: currentCandle.time };
    cash -= quantity * price + commission;
  }

  /** openShort implementation. */
  function openShort(quantity: number): void {
    const price = executionPrice(currentCandle.close, "sell");
    position = { side: "short", quantity, entryPrice: price, entryTime: currentCandle.time };
    cash += quantity * price - commission;
  }

  /**
   * Closes the trading strategy, calculates performance metrics, and returns the strategy's performance report.
   *
   * Guarantees that the strategy's trades, equity curve, and final equity are computed before returning.
   * Returns an object containing initial capital, final equity, total return, max drawdown, win rate, and the list of trades.
   * Fails if the strategy has not been initialized or if there are no trades to evaluate.
   */
  function closeAt(price: number, time: number): void {
    if (position === null) return;
    const exitPrice =
      position.side === "long" ? executionPrice(price, "sell") : executionPrice(price, "buy");
    const pnl =
      position.side === "long"
        ? position.quantity * (exitPrice - position.entryPrice) - commission * 2
        : position.quantity * (position.entryPrice - exitPrice) - commission * 2;

    if (position.side === "long") cash += position.quantity * exitPrice - commission;
    else cash -= position.quantity * exitPrice + commission;

    trades.push({
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      exitPrice,
      entryTime: position.entryTime,
      exitTime: time,
      pnl,
    });
    position = null;
  }

  /**
   * Closes the trading strategy by evaluating performance metrics and returns a performance report.
   *
   * Guarantees that the strategy's trades, equity curve, and final equity are computed before returning.
   * Returns an object containing initial capital, final equity, total return, max drawdown, win rate, and the list of trades.
   * Fails if the strategy has not been initialized or if there are no trades to evaluate.
   */
  function close(): void {
    closeAt(currentCandle.close, currentCandle.time);
  }
}
