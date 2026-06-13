import * as XLSX from "xlsx";
import type { Response } from "express";

/** Sends rows as a downloadable .xlsx attachment. */
export function sendXlsx(res: Response, fileName: string, sheets: { name: string; rows: Record<string, unknown>[] }[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(buf);
}

/** Parses the first worksheet into row objects keyed by trimmed headers. */
export function parseFirstSheet(buffer: Buffer): { headers: string[]; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const ws = wb.Sheets[sheetName];
  // raw:false → formatted strings, so "0:05:57" style durations survive.
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: "" });
  const headers = json.length > 0 ? Object.keys(json[0]) : [];
  return { headers: headers.map((h) => h.trim()), rows: json };
}
