/** Gap between neighbouring cards on the leads board, so most moves change only the moved card. */
export const BOARD_STEP = 1024;

/**
 * Where a card lands in a column (template drag & drop: drop before a card, or at the end). `column` is the target
 * column without the moved card, in board order. Returns the new position, or null when there is no gap left and the
 * column has to be renumbered first (`renumber`).
 */
export function boardPosition(column: { id: string; position: number }[], beforeId: string | null | undefined): number | null {
  if (!column.length) return 0;
  const i = beforeId ? column.findIndex((c) => c.id === beforeId) : -1;
  if (i < 0) return column[column.length - 1]!.position + BOARD_STEP;
  const next = column[i]!.position;
  if (i === 0) return next - BOARD_STEP;
  const prev = column[i - 1]!.position;
  const mid = Math.floor((prev + next) / 2);
  return mid > prev && mid < next ? mid : null;
}

/** Evenly spaced positions for a column in its current order. */
export const renumber = (column: { id: string }[]) => column.map((c, i) => ({ id: c.id, position: i * BOARD_STEP }));

/** A new lead goes on top of the Lead column (template: unshift). */
export const topPosition = (column: { position: number }[]) => (column.length ? Math.min(...column.map((c) => c.position)) - BOARD_STEP : 0);
