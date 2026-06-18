import { useEffect, useState } from "react";
import { User, Mail, Languages, Save, Calendar, Briefcase, Headset } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { ROLE_LABEL_KEYS } from "@/lib/i18n";

interface ProfileData {
  id: number;
  username: string;
  email: string;
  role: string;
  displayNameAr: string;
  displayNameEn: string;
  preferredLanguage: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  agent: null | {
    id: number;
    employeeId: string;
    nameAr: string;
    nameEn: string;
    inboundId: string | null;
    project: { id: number; nameAr: string; nameEn: string } | null;
    supervisor: { id: number; displayNameAr: string; displayNameEn: string } | null;
  };
}

export default function ProfilePage() {
  const { t, lang, dir } = useLanguage();
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApi<ProfileData>("/api/me/profile");

  const [displayNameAr, setDisplayNameAr] = useState("");
  const [displayNameEn, setDisplayNameEn] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (data) {
      setDisplayNameAr(data.displayNameAr);
      setDisplayNameEn(data.displayNameEn);
      setEmail(data.email);
    }
  }, [data]);

  const save = useApiMutation(
    () => apiRequest("PATCH", "/api/me/profile", { displayNameAr, displayNameEn, email }),
    {
      invalidate: [["/api/auth/me"], ["/api/me/profile"]],
      onSuccess: () => { refetch(); toast({ title: t("profileSaved") }); },
    },
  );

  const dirty = data && (
    displayNameAr !== data.displayNameAr ||
    displayNameEn !== data.displayNameEn ||
    email !== data.email
  );

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(lang === "ar" ? "ar-SA" : "en-US");
  };

  if (isLoading || !data) {
    return (
      <PageShell title={t("profileTitle")} subtitle={t("profileSubtitle")}>
        <Skeleton className="h-72 rounded-2xl" />
      </PageShell>
    );
  }

  const roleKey = ROLE_LABEL_KEYS[data.role] ?? "roleAgent";

  return (
    <PageShell title={t("profileTitle")} subtitle={t("profileSubtitle")}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Avatar / summary */}
        <Card className="rounded-2xl lg:col-span-1">
          <CardContent className="pt-8 pb-6 text-center">
            <div className="w-24 h-24 rounded-full bg-primary/15 text-primary text-3xl font-extrabold flex items-center justify-center mx-auto mb-3">
              {(lang === "ar" ? data.displayNameAr : data.displayNameEn).charAt(0)}
            </div>
            <h2 className="text-xl font-bold">{lang === "ar" ? data.displayNameAr : data.displayNameEn}</h2>
            <p className="text-sm text-muted-foreground" dir="ltr">@{data.username}</p>
            <Badge variant="outline" className="mt-3">{t(roleKey)}</Badge>
            <div className="mt-5 space-y-2 text-start text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                <span>{t("profileLastLogin")}: <span dir="ltr">{fmtDate(data.lastLoginAt)}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                <span>{t("profileCreatedAt")}: <span dir="ltr">{fmtDate(data.createdAt)}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Languages className="w-3.5 h-3.5" />
                <span>{t("profileLanguage")}: {data.preferredLanguage === "ar" ? "العربية" : "English"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Editable details */}
        <Card className="rounded-2xl lg:col-span-2">
          <CardContent className="pt-6 pb-6 space-y-4">
            <h3 className="font-bold flex items-center gap-2"><User className="w-4 h-4 text-primary" /> {t("profileAccount")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("usersUsername")}</Label>
                <Input value={data.username} disabled dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("usersRole")}</Label>
                <Input value={t(roleKey)} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>{t("usersDisplayNameAr")}</Label>
                <Input value={displayNameAr} onChange={(e) => setDisplayNameAr(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("usersDisplayNameEn")}</Label>
                <Input value={displayNameEn} onChange={(e) => setDisplayNameEn(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("usersEmail")}</Label>
                <Input value={email} type="email" onChange={(e) => setEmail(e.target.value)} dir="ltr" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => save.mutate(undefined as any)} disabled={!dirty || save.isPending} className="gap-2">
                <Save className="w-4 h-4" /> {t("save")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Agent details (only if linked) */}
        {data.agent && (
          <Card className="rounded-2xl lg:col-span-3">
            <CardContent className="pt-6 pb-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2"><Headset className="w-4 h-4 text-primary" /> {t("profileAgentSection")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <ReadOnly label={t("profileEmployeeId")} value={data.agent.employeeId} dir="ltr" />
                <ReadOnly label={t("agInboundId")} value={data.agent.inboundId ?? "—"} dir="ltr" />
                <ReadOnly label={t("agProject")}
                  value={data.agent.project ? (lang === "ar" ? data.agent.project.nameAr : data.agent.project.nameEn) : "—"} />
                <ReadOnly label={t("agSupervisor")}
                  value={data.agent.supervisor ? (lang === "ar" ? data.agent.supervisor.displayNameAr : data.agent.supervisor.displayNameEn) : t("agNoSupervisor")} />
              </div>
            </CardContent>
          </Card>
        )}

        {!data.agent && data.role === "agent" && (
          <Card className="rounded-2xl lg:col-span-3 border-amber-300/40">
            <CardContent className="py-6 text-center text-sm text-amber-700">
              {t("profileNoAgentLink")}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

function ReadOnly({ label, value, dir }: { label: string; value: string; dir?: "ltr" | "rtl" }) {
  return (
    <div className="bg-secondary/30 rounded-xl px-3 py-2.5">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm font-bold mt-0.5" dir={dir}>{value}</div>
    </div>
  );
}
