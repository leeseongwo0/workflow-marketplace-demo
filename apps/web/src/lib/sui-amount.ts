const MIST_PER_SUI = 1_000_000_000n;

/**
 * Prices are held as MIST integers (the on-chain unit) and only converted for
 * display, so mock catalog entries and real `price_mist` values from a
 * WorkflowRelease render through the same path.
 */
export function formatSui(mist: bigint | number): string {
  const value = typeof mist === "bigint" ? mist : BigInt(Math.round(mist));
  const whole = value / MIST_PER_SUI;
  const fraction = value % MIST_PER_SUI;
  if (fraction === 0n) return `${whole} SUI`;
  const decimals = fraction.toString().padStart(9, "0").replace(/0+$/u, "");
  return `${whole}.${decimals} SUI`;
}
