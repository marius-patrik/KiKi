import type { Candle } from "@dsh-stack/trading-research";

export interface MarketDataQuery {
  readonly symbol: string;
  readonly start?: number;
  readonly end?: number;
  readonly limit?: number;
}

export interface MarketDataProvider {
  readonly id: string;
  listSymbols(): Promise<readonly string[]>;
  getCandles(query: MarketDataQuery): Promise<readonly Candle[]>;
}

export class MarketDataRegistry {
  private readonly providers = new Map<string, MarketDataProvider>();

  /**
   * Registers a new market data provider.
   *
   * @param provider - The MarketDataProvider to register.
   * @throws Will throw an error if a provider with the same ID is already registered.
   * @returns Nothing.
   */
  register(provider: MarketDataProvider): void {
    if (this.providers.has(provider.id))
      throw new Error(`Market-data provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }

  /**
   * Retrieves the market data provider associated with the given ID.
   * @param id - The ID of the market data provider to retrieve.
   * @returns The MarketDataProvider associated with the ID, or undefined if not found.
   * @throws Will throw an error if the ID is not found.
   */
  get(id: string): MarketDataProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Lists all registered market data providers.
   * @returns An array of MarketDataProvider instances, representing all registered providers.
   * @throws Will throw an error if there are no providers registered.
   */
  list(): readonly MarketDataProvider[] {
    return [...this.providers.values()];
  }
}

export class MemoryMarketDataProvider implements MarketDataProvider {
  readonly id: string;
  private readonly symbols = new Map<string, Candle[]>();

  /** Constructs an instance. */
  constructor(id = "memory") {
    this.id = id;
  }

  /** seed implementation. */
  seed(symbol: string, candles: readonly Candle[]): void {
    const normalized = [...candles].sort((a, b) => a.time - b.time);
    this.symbols.set(symbol, normalized);
  }

  /** listSymbols implementation. */
  async listSymbols(): Promise<readonly string[]> {
    return [...this.symbols.keys()].sort();
  }

  /**
   * Returns a sorted list of symbols for which candle data is available.
   * @returns A sorted array of symbol names.
   * @throws Will throw an error if no symbols have been seeded with candle data.
   */
  async getCandles(query: MarketDataQuery): Promise<readonly Candle[]> {
    const data = this.symbols.get(query.symbol) ?? [];
    const filtered = data.filter((candle) => {
      if (query.start !== undefined && candle.time < query.start) return false;
      if (query.end !== undefined && candle.time > query.end) return false;
      return true;
    });
    return query.limit === undefined ? filtered : filtered.slice(-Math.max(0, query.limit));
  }
}
