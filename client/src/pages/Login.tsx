import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin, useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Database, Loader2, Lock, User } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const loginMutation = useLogin();
  const { t, dir, lang, toggleLang } = useLanguage();

  const formSchema = z.object({
    username: z.string().min(1, t("loginUsernameRequired")),
    password: z.string().min(1, t("loginPasswordRequired")),
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    if (user) setLocation(user.forcePasswordChange ? "/change-password" : "/");
  }, [user]);

  const onSubmit = async (values: FormValues) => {
    try {
      const logged = await loginMutation.mutateAsync(values);
      setLocation(logged.forcePasswordChange ? "/change-password" : "/");
    } catch {}
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir={dir}>
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      {/* Language toggle */}
      <button
        onClick={toggleLang}
        className="absolute top-4 left-4 text-sm font-bold text-muted-foreground hover:text-foreground bg-secondary/60 hover:bg-secondary px-3 py-1.5 rounded-xl transition-colors"
        data-testid="button-lang-toggle-login"
      >
        {lang === "ar" ? "EN" : "عربي"}
      </button>

      <div className="relative w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-primary p-4 rounded-2xl shadow-xl shadow-primary/25 mb-4">
            <Database className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">{t("loginTitle")}</h1>
          <p className="text-muted-foreground mt-2 text-base">{t("loginSubtitle")}</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border/60 rounded-3xl shadow-2xl shadow-black/10 p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                    <FormLabel className="font-semibold text-foreground">{t("loginUsername")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                        <Input
                          placeholder={t("loginUsernamePlaceholder")}
                          className={`bg-secondary/30 border-secondary h-12 ${dir === "rtl" ? "pr-10" : "pl-10"}`}
                          autoComplete="username"
                          {...field}
                          data-testid="input-login-username"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className={dir === "rtl" ? "text-right" : "text-left"}>
                    <FormLabel className="font-semibold text-foreground">{t("loginPassword")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                        <Input
                          type="password"
                          placeholder={t("loginPasswordPlaceholder")}
                          className={`bg-secondary/30 border-secondary h-12 ${dir === "rtl" ? "pr-10" : "pl-10"}`}
                          autoComplete="current-password"
                          {...field}
                          data-testid="input-login-password"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-primary to-blue-600 text-white font-bold text-base rounded-xl shadow-lg shadow-primary/25 mt-2"
                disabled={loginMutation.isPending}
                data-testid="button-login-submit"
              >
                {loginMutation.isPending ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : null}
                {t("loginButton")}
              </Button>
            </form>
          </Form>
        </div>

      </div>
    </div>
  );
}
