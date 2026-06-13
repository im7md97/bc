import { useMemo, useState } from "react";
import { ShieldCheck, ToggleLeft, Check, X } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROLE_LABEL_KEYS } from "@/lib/i18n";

interface PermissionsPayload {
  roles: string[];
  definitions: { key: string; labelAr: string; labelEn: string; group: string }[];
  grants: { role: string; permissionKey: string }[];
}

interface FeatureFlag {
  id: number;
  key: string;
  labelAr: string;
  labelEn: string;
  isEnabled: boolean;
  appliesToRoles: string[] | null;
  updatedAt: string;
}

export default function SuperAdminPage() {
  const { t, lang } = useLanguage();

  const { data: perms, isLoading: loadingPerms, refetch: refetchPerms } = useApi<PermissionsPayload>("/api/super/permissions");
  const { data: flags, isLoading: loadingFlags, refetch: refetchFlags } = useApi<FeatureFlag[]>("/api/super/feature-flags");

  const grantMatrix = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const g of perms?.grants ?? []) {
      if (!m.has(g.role)) m.set(g.role, new Set());
      m.get(g.role)!.add(g.permissionKey);
    }
    return m;
  }, [perms]);

  const togglePermission = useApiMutation(
    ({ role, permissionKey, granted }: { role: string; permissionKey: string; granted: boolean }) =>
      apiRequest("PUT", "/api/super/permissions", { role, permissionKey, granted }),
    { onSuccess: () => { refetchPerms(); } },
  );

  const toggleFlag = useApiMutation(
    ({ key, isEnabled, appliesToRoles }: { key: string; isEnabled?: boolean; appliesToRoles?: string[] | null }) =>
      apiRequest("PATCH", `/api/super/feature-flags/${key}`, { isEnabled, appliesToRoles }),
    { onSuccess: () => { refetchFlags(); } },
  );

  const grouped = useMemo(() => {
    const g: Record<string, PermissionsPayload["definitions"]> = {};
    for (const def of perms?.definitions ?? []) {
      if (!g[def.group]) g[def.group] = [];
      g[def.group].push(def);
    }
    return g;
  }, [perms]);

  return (
    <PageShell title={t("saTitle")} subtitle={t("saSubtitle")}>
      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions" className="gap-2"><ShieldCheck className="w-4 h-4" />{t("saPermissionsTab")}</TabsTrigger>
          <TabsTrigger value="flags" className="gap-2"><ToggleLeft className="w-4 h-4" />{t("saFlagsTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          {loadingPerms && <Skeleton className="h-72 rounded-2xl" />}
          {perms && (
            <Card className="rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky start-0 bg-card z-10 min-w-[260px]">{t("saPermission")}</TableHead>
                      {perms.roles.map((r) => (
                        <TableHead key={r} className="text-center min-w-[110px]">
                          {t(ROLE_LABEL_KEYS[r] || "roleAgent")}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(grouped).map(([group, defs]) => (
                      <>
                        <TableRow key={`group-${group}`}>
                          <TableCell colSpan={1 + perms.roles.length} className="bg-secondary/30 font-semibold text-xs uppercase">
                            {group}
                          </TableCell>
                        </TableRow>
                        {defs.map((def) => (
                          <TableRow key={def.key}>
                            <TableCell className="sticky start-0 bg-card">
                              <div className="font-semibold text-sm">{lang === "ar" ? def.labelAr : def.labelEn}</div>
                              <div className="text-[10px] text-muted-foreground" dir="ltr">{def.key}</div>
                            </TableCell>
                            {perms.roles.map((role) => {
                              const granted = grantMatrix.get(role)?.has(def.key) ?? false;
                              return (
                                <TableCell key={role} className="text-center">
                                  <Checkbox
                                    checked={granted}
                                    onCheckedChange={(v) =>
                                      togglePermission.mutate({ role, permissionKey: def.key, granted: !!v })
                                    }
                                    data-testid={`perm-${role}-${def.key}`}
                                  />
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="flags">
          {loadingFlags && <Skeleton className="h-72 rounded-2xl" />}
          <div className="space-y-2">
            {(flags ?? []).map((f) => (
              <Card key={f.id} className="rounded-2xl">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex-1 min-w-[240px]">
                      <div className="font-bold">{lang === "ar" ? f.labelAr : f.labelEn}</div>
                      <div className="text-[10px] text-muted-foreground" dir="ltr">{f.key}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {f.isEnabled
                        ? <Badge variant="default" className="gap-1"><Check className="w-3 h-3" /> {t("saEnabled")}</Badge>
                        : <Badge variant="destructive" className="gap-1"><X className="w-3 h-3" /> {t("saGlobalOff")}</Badge>}
                      <Switch
                        checked={f.isEnabled}
                        onCheckedChange={(v) => toggleFlag.mutate({ key: f.key, isEnabled: v })}
                        data-testid={`flag-${f.key}`}
                      />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-xs text-muted-foreground mb-2">{t("saAppliesTo")}</div>
                    <div className="flex flex-wrap gap-2">
                      {(perms?.roles ?? []).map((r) => {
                        const restricted = f.appliesToRoles?.includes(r) ?? false;
                        return (
                          <label key={r} className="inline-flex items-center gap-1.5 bg-secondary/40 rounded-full px-2.5 py-1 cursor-pointer">
                            <Checkbox
                              checked={restricted}
                              onCheckedChange={(v) => {
                                const next = new Set(f.appliesToRoles ?? []);
                                if (v) next.add(r); else next.delete(r);
                                const list = Array.from(next);
                                toggleFlag.mutate({ key: f.key, appliesToRoles: list.length > 0 ? list : null });
                              }}
                            />
                            <span className="text-xs">{t(ROLE_LABEL_KEYS[r] || "roleAgent")}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
