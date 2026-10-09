import { IdCard, ListTree, Package, Scale, Truck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { IMPORT_ENTITIES, type ImportEntity } from "@/shared";
import { downloadCsv } from "@/features/finance/components/finance-ui";

export type ImportCan = { create: boolean; export: boolean; customers: boolean; vendors: boolean; items: boolean };
/** Data rows mapped to field keys (field key → cell text), in file order; row n is index n - 1. */
export type MappedRow = Record<string, string>;

/** Card look per importable entity (template ENT: icon, tile, description). */
export const ENT_UI: Record<ImportEntity, { icon: ReactNode; tile: string; desc: string; can: keyof ImportCan }> = {
  CUSTOMERS: { icon: <Users />, tile: "green", desc: "Name, NTN, CNIC, contacts and credit limit", can: "customers" },
  VENDORS: { icon: <Truck />, tile: "orange", desc: "Suppliers with NTN, STRN and ATL filer status", can: "vendors" },
  ITEMS: { icon: <Package />, tile: "blue", desc: "SKUs, barcodes, units, cost & price", can: "items" },
};
/** Template cards not importable in this phase: shown disabled ("Coming later"). */
export const COMING_LATER = [
  { key: "opening", label: "Opening balances", icon: <Scale />, tile: "violet", desc: "Trial balance as at the go-live date" },
  { key: "employees", label: "Employees", icon: <IdCard />, tile: "lime", desc: "CNIC, department, joining date, salary" },
  { key: "coa", label: "Chart of accounts", icon: <ListTree />, tile: "red", desc: "Groups, sub-groups and ledgers" },
];

export const isEntity = (v: string): v is ImportEntity => v in IMPORT_ENTITIES;
export const entLabel = (v: string) => (isEntity(v) ? IMPORT_ENTITIES[v].label : v);
export const fmtN = (n: number) => n.toLocaleString("en-US");
export const fileSize = (b: number) => (b < 1024 * 100 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(2)} MB`);

/** One CSV per entity: the field labels, `*` on required ones (Auto-map recognises them). */
export function downloadTemplate(entity: ImportEntity) {
  downloadCsv(`accountex_${entity.toLowerCase()}_template.csv`, [IMPORT_ENTITIES[entity].fields.map((f) => f.label + (f.required ? " *" : ""))]);
}

export const STATUS_TONE: Record<string, "good" | "warn" | "danger" | "info" | "neutral"> = {
  COMPLETED: "good", VALIDATED: "info", MAPPED: "neutral", IMPORTING: "info", CANCELLED: "neutral", FAILED: "danger",
};
export const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
