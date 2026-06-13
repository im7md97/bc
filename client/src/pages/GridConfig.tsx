import { useEffect, useState } from "react";
import { Save, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface GridConfigRow {
  id: number;
  projectId: number;
  metricKey: string;
  labelAr: string;
  labelEn: string;
  weight: string;
  scoringType: "tiered" | "binary";
  tierDirection: "higher_better" | "lower_better";
  tiers: { max?: number; maxInclusive?: boolean; score: number }[] | null;
  binaryThreshold: string | null;
  binaryDirection: "gte" | "lte" | null;
  aggregation: "average" | "sum";
  sourceMetricKey: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface ProjectOption { id: number; nameAr: string; nameEn: string; }

export default function GridConfigPage() {
  const { t, lang, dir } = useLanguage();
  const [projectId, setProjectId] = useState<string>("");
  const [rows, setRows] = useState<GridConfigRow[]>([]);

  const { data: projects } = useApi<ProjectOption[]>("/api/projects");
  const { data: configs, isLoading } = useApi<GridConfigRow[]>(
    projectId ? `/api/scorecards/grid/${projectId}` : "",
    { enabled: !!projectId, queryKey: ["/api/scorecards/grid", projectId] },
  );

  useEffect(() => { if (configs) setRows(configs); }, [configs]);
  useEffect(() => {
    if (projects && projects.length > 0 && !projectId) setProjectId(String(projects[0].id));
  }, [projects]);

  const sumWeights = rows.filter((r) => r.isActive).reduce((a, r) => a + Number(r.weight || 0), 0);
  const validSum = Math.abs(sumWeights - 1) <= 0.0001;

  const save = useApiMutation(
    () => apiRequest<GridConfigRow[]>("PUT", `/api/scorecards/grid/${projectId}`, { rows }),
    {
      invalidate: [["/api/scorecards/grid", projectId]],
      successMessage: t("saveSuccess"),
    },
  );

  const setRow = (idx: number, patch: Partial<GridConfigRow>) =>
    setRows((s) => s.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const setTier = (rowIdx: number, tierIdx: number, patch: Partial<{ max: number | undefined; score: number }>) => {
    setRows((s) => s.map((r, i) => {
      if (i !== rowIdx) return r;
      const tiers = (r.tiers ?? []).slice();
      tiers[tierIdx] = { ...tiers[tierIdx], ...patch };
      return { ...r, tiers };
    }));
  };

  return (
    <PageShell title={t("scGridTitle")} subtitle={t("scGridSubtitle")}>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="space-y-1.5 min-w-[260px]">
          <Label>{t("scProject")}</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
            <SelectContent>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{lang === "ar" ? p.nameAr : p.nameEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <Badge variant={validSum ? "default" : "destructive"} className="text-sm">
            {t("scWeightSum")}: <span dir="ltr">{(sumWeights * 100).toFixed(2)}%</span>
            {!validSum && <AlertCircle className="w-3.5 h-3.5 ms-1" />}
          </Badge>
          <Button onClick={() => save.mutate(undefined as any)} disabled={!validSum || rows.length === 0 || save.isPending} className="gap-2">
            <Save className="w-4 h-4" /> {t("save")}
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm">{t("loading")}</div>}

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <Card key={row.id} className="rounded-2xl">
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                <div className="md:col-span-3">
                  <div className="font-bold">{lang === "ar" ? row.labelAr : row.labelEn}</div>
                  <div className="text-[10px] text-muted-foreground" dir="ltr">{row.metricKey}</div>
                </div>
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">{t("scWeight")} (0.0–1.0)</Label>
                  <Input dir="ltr" value={row.weight} onChange={(e) => setRow(idx, { weight: e.target.value })} />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-xs">{t("scScoringType")}</Label>
                  <Select value={row.scoringType} onValueChange={(v) => setRow(idx, { scoringType: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiered">{t("scTiered")}</SelectItem>
                      <SelectItem value="binary">{t("scBinary")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {row.scoringType === "tiered" && (
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs">{t("scTierDirection")}</Label>
                    <Select value={row.tierDirection} onValueChange={(v) => setRow(idx, { tierDirection: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="higher_better">{t("scHigherBetter")}</SelectItem>
                        <SelectItem value="lower_better">{t("scLowerBetter")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="md:col-span-2 flex items-center gap-2 pt-5">
                  <Switch checked={row.isActive} onCheckedChange={(v) => setRow(idx, { isActive: v })} id={`active-${row.id}`} />
                  <Label htmlFor={`active-${row.id}`} className="text-xs">{t("scActive")}</Label>
                </div>
              </div>

              {row.scoringType === "tiered" && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("scBand")}</TableHead>
                      <TableHead>{t("scBandMax")}</TableHead>
                      <TableHead>{t("scBandScore")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(row.tiers ?? []).map((tier, ti) => (
                      <TableRow key={ti}>
                        <TableCell className="font-semibold">{ti + 1}</TableCell>
                        <TableCell>
                          {ti === (row.tiers?.length ?? 0) - 1 ? (
                            <span className="text-xs text-muted-foreground">{t("scCatchAll")}</span>
                          ) : (
                            <Input className="h-8 max-w-[140px]" dir="ltr" value={tier.max ?? ""}
                              onChange={(e) => setTier(idx, ti, { max: e.target.value === "" ? undefined : Number(e.target.value) })} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 max-w-[100px]" dir="ltr" value={tier.score}
                            onChange={(e) => setTier(idx, ti, { score: Number(e.target.value) })} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {row.scoringType === "binary" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("scBinaryThreshold")}</Label>
                    <Input dir="ltr" value={row.binaryThreshold ?? ""}
                      onChange={(e) => setRow(idx, { binaryThreshold: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("scTierDirection")}</Label>
                    <Select value={row.binaryDirection ?? "gte"} onValueChange={(v) => setRow(idx, { binaryDirection: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gte">{t("scBinaryGte")}</SelectItem>
                        <SelectItem value="lte">{t("scBinaryLte")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
