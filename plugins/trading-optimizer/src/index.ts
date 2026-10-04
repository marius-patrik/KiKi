import type { BacktestResult, Strategy } from "@dsh-stack/trading-backtest";
import { runBacktest } from "@dsh-stack/trading-backtest";
import type { Candle } from "@dsh-stack/trading-research";

export type ParameterValue = string | number | boolean;
export type ParameterGrid = Readonly<Record<string, readonly ParameterValue[]>>;

export interface Evaluation {
  readonly parameters: Readonly<Record<string, ParameterValue>>;
  readonly train: BacktestResult;
  readonly test?: BacktestResult;
}

export interface OptimizationOptions {
  readonly minimumTrainTrades?: number;
  readonly objective?: (result: BacktestResult) => number;
  readonly limit?: number;
}

/**
 * Conducts a grid search to evaluate trading strategies.
 *
 * @param candles - The historical candle data used for training and testing.
 * @param createStrategy - A function to create a strategy given parameters.
 * @param trainSplit - The proportion of candles to use for training (between 0 and 1).
 * @param grid - A parameter grid defining the range of parameters to test.
 * @param options - Additional optimization options, including the objective function and minimum train trades.
 * @param testCandles - Optional additional candle data for testing.
 * @returns An array of evaluations, each containing the parameters, train result, and test result.
 * @throws Throws an error if trainSplit is not between 0 and 1.
 */
export function gridSearch(
  candles: readonly Candle[],
  createStrategy: (parameters: Readonly<Record<string, ParameterValue>>) => Strategy,
  trainSplit: number,
  grid: ParameterGrid,
  options: OptimizationOptions = {},
  testCandles?: readonly Candle[],
): readonly Evaluation[] {
  if (!(trainSplit > 0 && trainSplit < 1)) throw new Error("trainSplit must be between 0 and 1");
  const splitIndex = Math.floor(candles.length * trainSplit);
  const train = candles.slice(0, splitIndex);
  const test = testCandles ?? candles.slice(splitIndex);
  const objective = options.objective ?? ((result) => result.totalReturn - result.maxDrawdown);
  const minimumTrainTrades = options.minimumTrainTrades ?? 0;
  const evaluations: Evaluation[] = [];

  for (const parameters of combinations(grid)) {
    const trainResult = runBacktest(train, createStrategy(parameters));
    if (trainResult.trades.length < minimumTrainTrades) continue;
    const testResult = test.length > 0 ? runBacktest(test, createStrategy(parameters)) : undefined;
    evaluations.push({ parameters, train: trainResult, test: testResult });
  }

  evaluations.sort((left, right) => {
    const leftScore = objective(left.test ?? left.train);
    const rightScore = objective(right.test ?? right.train);
    return rightScore - leftScore;
  });
  return options.limit === undefined
    ? evaluations
    : evaluations.slice(0, Math.max(0, options.limit));
}

/**
 * Generates all possible combinations of parameters from the given grid.
 *
 * Guarantees that each combination is evaluated based on the provided objective function,
 * and only combinations with at least `minimumTrainTrades` trades are considered.
 *
 * Returns a generator of parameter combinations that are sorted by the evaluation score.
 * On failure paths, combinations with fewer trades than `minimumTrainTrades` are skipped.
 */
function* combinations(grid: ParameterGrid): Generator<Record<string, ParameterValue>> {
  const entries = Object.entries(grid);
  /**
   * Generates and evaluates all possible combinations of parameters from the given grid.
   *
   * Guarantees that each combination is evaluated based on the provided objective function,
   * and only returns combinations with at least `minimumTrainTrades` trades.
   *
   * Returns a sorted array of parameter combinations based on their evaluation score.
   * On failure paths, combinations with fewer trades than `minimumTrainTrades` are skipped.
   */
  function* walk(
    index: number,
    current: Record<string, ParameterValue>,
  ): Generator<Record<string, ParameterValue>> {
    if (index === entries.length) {
      yield { ...current };
      return;
    }
    const [key, values] = entries[index]!;
    if (values.length === 0) return;
    for (const value of values) {
      current[key] = value;
      yield* walk(index + 1, current);
    }
    delete current[key];
  }
  yield* walk(0, {});
}
