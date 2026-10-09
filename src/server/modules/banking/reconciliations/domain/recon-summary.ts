/** Bank reconciliation arithmetic (the same formulas as the table's generated columns). */
export type ReconLine = { id: string; amount: number; matched: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function reconSummary(statementBalance: number, bookBalance: number, statement: ReconLine[], book: ReconLine[]) {
  const openBook = book.filter((b) => !b.matched);
  const openStmt = statement.filter((s) => !s.matched);
  const unpresentedCheques = r2(openBook.filter((b) => b.amount < 0).reduce((s, b) => s - b.amount, 0));
  const depositsInTransit = r2(openBook.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0));
  const unbookedCredits = r2(openStmt.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const unbookedDebits = r2(openStmt.filter((l) => l.amount < 0).reduce((s, l) => s - l.amount, 0));
  const adjustedBankBalance = r2(statementBalance - unpresentedCheques + depositsInTransit);
  const adjustedBookBalance = r2(bookBalance + unbookedCredits - unbookedDebits);
  return { statementBalance, bookBalance, unpresentedCheques, depositsInTransit, unbookedCredits, unbookedDebits, adjustedBankBalance, adjustedBookBalance, difference: r2(adjustedBankBalance - adjustedBookBalance) };
}
