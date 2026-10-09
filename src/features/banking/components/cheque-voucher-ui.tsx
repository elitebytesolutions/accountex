"use client";

import { Money } from "@/features/finance/components/finance-ui";

/** Shared bits of the Cheque Voucher screen (template 94-purchase-docs.js): amount in words, dates, money text. */
const A = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const B = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (x: number) => (x < 20 ? A[x]! : B[Math.floor(x / 10)]! + (x % 10 ? ` ${A[x % 10]}` : ""));
const three = (x: number) => (x >= 100 ? `${A[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x));

/** Template words(): Pakistani grouping (crore, lakh, thousand). */
export function words(value: number) {
  let n = Math.floor(Math.abs(value));
  if (!n) return "Zero";
  const out: string[] = [];
  const cr = Math.floor(n / 1e7); n %= 1e7;
  const lk = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1000); n %= 1000;
  if (cr) out.push(`${cr > 999 ? cr.toLocaleString("en-US") : three(cr)} Crore`);
  if (lk) out.push(`${two(lk)} Lakh`);
  if (th) out.push(`${two(th)} Thousand`);
  if (n) out.push(three(n));
  return out.join(" ");
}

/** "Rupees Twelve Thousand and 50 Paisa Only" — empty for zero. */
export function amountInWords(amount: number) {
  if (!(amount > 0)) return "";
  const paisa = Math.round((amount % 1) * 100);
  return `Rupees ${words(amount)}${paisa ? ` and ${paisa} Paisa` : ""} Only`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** 2026-10-07 → 07 / 10 / 2026 (the cheque face). */
export const chequeDate = (iso: string) => (iso ? iso.split("-").reverse().join(" / ") : "— — —");

export const num = (v: string) => {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const Rs = ({ value }: { value: number }) => <Money value={value} />;
export const rsText = (value: number) => `Rs ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
