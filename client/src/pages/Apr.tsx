import { useMemo, useState } from "react";
import { Download, History, Eye, Search } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useApi } from "@/hooks/use-api";
import { downloadFile } from "@/lib/api";
import { useAuth, can, featureOn } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatMetric, type MetricDef } from "@/lib/duration";
import { apiRequest } from "@/lib/api";

interface AprRow {
  agentId: number;
  employeeId: string;
  nameAr: string;
  nameEn: string;
  projectNameAr: string | null;
  projectNameEn: string | null;
  supervisorNameAr: string | null;
  supervisorNameEn: string | null;
  asOfDate: string | null;
  uploadedAt: string | null;
  metrics: Record<string, unknown> | null;
}

interface Snapshot {
  id: number;
  asOfDate: string;
  timeFormat: string;
  fileName: string | null;
  rowCount: number;
  createdAt: string;
  uploadedByAr: string | null;
  uploadedByEn: string | null;
  projectNameAr: string | null;
  projectNameEn: string | null;
}

interface SnapshotDetail {
  snapshot: Snapshot;
  rows: { agentId: number; employeeId: string; nameAr: string; nameEn: string; metrics: Record<string, unknown> }[];
  metricDefs: MetricDef[];
}

export default function AprPage() {
  const { t, lang, dir } = useLanguage();
  const { data: me } = useAuth();
  const [search, setSearch] = useState("");
  const [snapshotDetail, setSnapshotDetail] = useState<number | null>(null);

  const { data, isLoading } = useApi<{ rows: AprRow[]; metricDefs: MetricDef[] }>("/api/apr/latest");
  const { data: snapshots } = useApi<Snapshot[]>("/api/apr/snapshots",
    { enabled: can(me, "apr.history_view") && featureOn(me, "apr.history") });
  const { data: detail } = useApi<SnapshotDetail>(
    snapshotDetail ? `/api/apr/snapshots/${snapshotDetail}` : "",
    { enabled: !!snapshotDetail, queryKey: ["/api/apr/snapshots", snapshotDetail] },
  );

  const rows = data?.rows ?? [];
  const defs = (data?.metricDefs ?? []).filter((d) => d.isVisible).sort((a, b) => a.displayOrder - b.displayOrder);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      r.employeeId.toLowerCase().includes(s) ||
      r.nameAr.toLowerCase().includes(s) ||
      r.nameEn.toLowerCase().includes(s));
  }, [rows, search]);

  const exportCurrent = () => downloadFile("/api/apr/export", "apr-latest.xlsx");
  const exportSnapshot = (id: number) => downloadFile(`/api/apr/export?snapshotId=${id}`, `apr-snapshot-${id}.xlsx`);

  // Agent gets a one-row dashboard view (§7.5).
  const isAgentView = can(me, "apr.view_own") && !can(me, "apr.view_all", "apr.view_project", "apr.view_team");
  const myRow = isAgentView ? rows[0] : null;
  const showExport = can(me, "apr.export") && featureOn(me, "apr.export");
  const showHistory = can(me, "apr.history_view") && featureOn(me, "apr.history");

  if (isAgentView) {
    return (
      <PageShell title={t("aprMyTitle")}>
        {isLoading && <Skeleton className="h-72 rounded-2xl" />}
        {!isLoading && !myRow && (
          <Card className="rounded-2xl">
            <CardContent className="py-16 text-center text-muted-foreground">{t("aprNoDataYet")}</CardContent>
          </Card>
        )}
        {myRow && (
          <Card className="rounded-2xl">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-6">
                <div>
                  <h2 className="text-xl font-bold">{lang === "ar" ? myRow.nameAr : myRow.nameEn}</h2>
                  <p className="text-xs text-muted-foreground" dir="ltr">{myRow.employeeId}</p>
                </div>
                {myRow.asOfDate && (
                  <div className="text-sm text-muted-foreground" dir={dir === "rtl" ? "rtl" : "ltr"}>
                    <span className="font-semibold">{t("aprLastUpdated")}:</span>{" "}
                    <span dir="ltr">{myRow.asOfDate}</span>{" "}
                    {myRow.uploadedAt && (
                      <>
                        {t("aprAt")} <span dir="ltr">{new Date(myRow.uploadedAt).toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-US")}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {defs.map((d) => (
                  <div key={d.key} className="bg-secondary/30 rounded-xl px-3 py-2.5">
                    <div className="text-[11px] text-muted-foreground font-semibold">{lang === "ar" ? d.labelAr : d.labelEn}</div>
                    <div className="text-base font-bold mt-0.5" dir="ltr">{formatMetric(d, myRow.metrics?.[d.key])}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell
      title={t("aprTitle")}
      actions={
        <>
          {showExport && (
            <Button variant="outline" onClick={exportCurrent} className="gap-2">
              <Download className="w-4 h-4" /> {t("export")}
            </Button>
          )}
          {showHistory && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <History className="w-4 h-4" /> {t("aprHistory")}
                </Button>
              </SheetTrigger>
              <SheetContent side={dir === "rtl" ? "left" : "right"} className="w-[420px] max-w-full" dir={dir}>
                <SheetHeader>
                  <SheetTitle>{t("aprHistory")}</SheetTitle>
                </SheetHeader>
                <div className="space-y-2 mt-4 overflow-y-auto max-h-[calc(100vh-100px)]">
                  {(snapshots ?? []).map((s) => (
                    <Card key={s.id} className="rounded-xl">
                      <CardContent className="p-3">
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <span className="font-bold" dir="ltr">{s.asOfDate}</span>
                          <span className="text-xs text-muted-foreground">{s.rowCount} {t("aprRows")}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {lang === "ar" ? s.projectNameAr : s.projectNameEn} — {t("aprUploadedBy")}: {lang === "ar" ? s.uploadedByAr : s.uploadedByEn}
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" className="gap-1 h-7" onClick={() => setSnapshotDetail(s.id)}>
                            <Eye className="w-3.5 h-3.5" /> {t("view")}
                          </Button>
                          {showExport && (
                            <Button size="sm" variant="ghost" className="gap-1 h-7" onClick={() => exportSnapshot(s.id)}>
                              <Download className="w-3.5 h-3.5" /> {t("export")}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </>
      }
    >
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <Input
            placeholder={t("search")}
            className={dir === "rtl" ? "pr-10" : "pl-10"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky start-0 bg-card z-10">{t("aprAgent")}</TableHead>
                <TableHead>{t("aprDate")}</TableHead>
                <TableHead>{t("aprProject")}</TableHead>
                <TableHead>{t("aprSupervisor")}</TableHead>
                {defs.map((d) => (
                  <TableHead key={d.key} className="whitespace-nowrap">{lang === "ar" ? d.labelAr : d.labelEn}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4 + defs.length}><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={4 + defs.length} className="text-center py-8 text-muted-foreground">{t("aprNoDataYet")}</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.agentId}>
                  <TableCell className="sticky start-0 bg-card font-semibold">
                    <div>{lang === "ar" ? r.nameAr : r.nameEn}</div>
                    <div className="text-[10px] text-muted-foreground" dir="ltr">{r.employeeId}</div>
                  </TableCell>
                  <TableCell dir="ltr" className="text-xs">{r.asOfDate ?? "—"}</TableCell>
                  <TableCell className="text-xs">{lang === "ar" ? r.projectNameAr : r.projectNameEn}</TableCell>
                  <TableCell className="text-xs">{lang === "ar" ? r.supervisorNameAr : r.supervisorNameEn}</TableCell>
                  {defs.map((d) => (
                    <TableCell key={d.key} dir="ltr" className="whitespace-nowrap text-sm">
                      {r.metrics ? formatMetric(d, r.metrics[d.key]) : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!snapshotDetail} onOpenChange={(o) => !o && setSnapshotDetail(null)}>
        <DialogContent dir={dir} className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{t("aprSnapshotOf")} — {detail?.snapshot.asOfDate}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("aprAgent")}</TableHead>
                  {(detail?.metricDefs ?? []).map((d) => (
                    <TableHead key={d.key} className="whitespace-nowrap">{lang === "ar" ? d.labelAr : d.labelEn}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail?.rows.map((r) => (
                  <TableRow key={r.agentId}>
                    <TableCell className="font-semibold">
                      {lang === "ar" ? r.nameAr : r.nameEn} <span className="text-xs text-muted-foreground" dir="ltr">({r.employeeId})</span>
                    </TableCell>
                    {(detail?.metricDefs ?? []).map((d) => (
                      <TableCell key={d.key} dir="ltr" className="text-sm whitespace-nowrap">
                        {formatMetric(d, r.metrics[d.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
