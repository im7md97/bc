import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface NotificationItem {
  id: number;
  type: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string | null;
  bodyEn: string | null;
  linkPath: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const { lang, t, dir } = useLanguage();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data } = useQuery<{ items: NotificationItem[]; unreadCount: number }>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notification-bell">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center" dir="ltr">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("notifTitle")}</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
              onClick={(e) => { e.preventDefault(); markAllRead.mutate(); }}>
              <CheckCheck className="w-3.5 h-3.5" />
              {t("notifMarkAllRead")}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("notifEmpty")}</div>
        )}
        {items.map((n) => (
          <DropdownMenuItem
            key={n.id}
            className={`flex flex-col items-start gap-0.5 py-2.5 cursor-pointer ${n.isRead ? "opacity-60" : ""}`}
            onClick={() => {
              if (!n.isRead) markRead.mutate(n.id);
              if (n.linkPath) setLocation(n.linkPath);
            }}
          >
            <span className="text-sm font-semibold flex items-center gap-2">
              {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary inline-block shrink-0" />}
              {lang === "ar" ? n.titleAr : n.titleEn}
            </span>
            {(lang === "ar" ? n.bodyAr : n.bodyEn) && (
              <span className="text-xs text-muted-foreground">{lang === "ar" ? n.bodyAr : n.bodyEn}</span>
            )}
            <span className="text-[10px] text-muted-foreground" dir="ltr">
              {new Date(n.createdAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
