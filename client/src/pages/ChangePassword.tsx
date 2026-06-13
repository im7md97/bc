import { useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth, useChangePassword } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";

export default function ChangePasswordPage() {
  const { data: user } = useAuth();
  const { t, dir } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const changePassword = useChangePassword();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const forced = user?.forcePasswordChange;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirmPw) { setMismatch(true); return; }
    setMismatch(false);
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      toast({ title: t("cpSuccess") });
      // Hard navigate so the server's updated /me payload (force=false) is freshly fetched.
      window.location.href = "/";
    } catch { /* toast shown by hook */ }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir={dir}>
      <Card className="w-full max-w-md rounded-3xl">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center bg-primary p-4 rounded-2xl shadow-xl shadow-primary/25 mb-3 mx-auto">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <CardTitle className="text-2xl font-extrabold">{t("cpTitle")}</CardTitle>
          {forced && <CardDescription className="text-amber-600 font-semibold">{t("cpForcedHint")}</CardDescription>}
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("cpCurrent")}</Label>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password" required className="h-11" data-testid="input-cp-current" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("cpNew")}</Label>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password" required minLength={8} className="h-11" data-testid="input-cp-new" />
              <p className="text-xs text-muted-foreground">{t("cpMinLength")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("cpConfirm")}</Label>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="new-password" required className="h-11" data-testid="input-cp-confirm" />
              {mismatch && <p className="text-xs text-red-500 font-semibold">{t("cpMismatch")}</p>}
            </div>
            <Button type="submit" className="w-full h-11 font-bold" disabled={changePassword.isPending}>
              {changePassword.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t("cpButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
