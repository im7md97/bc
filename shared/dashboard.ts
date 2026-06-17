// Catalog of every dashboard widget the user can pin to their home page.
// The frontend renders the actual UI; this is the shared metadata.

export interface DashboardWidgetDef {
  key: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  // Any one of these permission keys is enough.
  requiredPerms: string[];
  size: "sm" | "md" | "lg" | "xl";
}

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  {
    key: "apr_latest",
    titleAr: "آخر بيانات APR",
    titleEn: "Latest APR snapshot",
    descriptionAr: "أحدث المقاييس مع تاريخ آخر تحديث",
    descriptionEn: "Most recent metrics with last-updated timestamp",
    requiredPerms: ["apr.view_own", "apr.view_team", "apr.view_project", "apr.view_all"],
    size: "lg",
  },
  {
    key: "qc_summary",
    titleAr: "ملخص الجودة",
    titleEn: "QC summary",
    descriptionAr: "إجمالي/معتمد/مرفوض/بانتظار للشهر الحالي",
    descriptionEn: "Total / approved / rejected / pending for the current month",
    requiredPerms: ["qc.view_own", "qc.evaluate", "qc.approve", "qc.approve_team"],
    size: "md",
  },
  {
    key: "qc_pass_rates",
    titleAr: "نسب نجاح الجودة",
    titleEn: "QC pass rates",
    descriptionAr: "ثلاث donut للمقاييس الحرجة",
    descriptionEn: "Three donut charts for the critical metrics",
    requiredPerms: ["qc.view_own", "qc.evaluate", "qc.approve", "qc.approve_team"],
    size: "lg",
  },
  {
    key: "schedule_today",
    titleAr: "شفت اليوم",
    titleEn: "Today's shift",
    descriptionAr: "موعد بداية ونهاية اليوم مع البريكات",
    descriptionEn: "Today's shift times and breaks",
    requiredPerms: ["schedule.view_own"],
    size: "sm",
  },
  {
    key: "schedule_week",
    titleAr: "هذا الأسبوع",
    titleEn: "This week",
    descriptionAr: "7 أيام بإيجاز",
    descriptionEn: "7-day strip view",
    requiredPerms: ["schedule.view_own", "schedule.view_team", "schedule.view_project", "schedule.manage"],
    size: "lg",
  },
  {
    key: "scorecards_recent",
    titleAr: "آخر بطاقات الأداء",
    titleEn: "Recent score cards",
    descriptionAr: "آخر 3 بطاقات مع النتيجة النهائية",
    descriptionEn: "Last 3 cards with final scores",
    requiredPerms: ["scorecard.view_own", "scorecard.view_team", "scorecard.view_project", "scorecard.view_all"],
    size: "md",
  },
  {
    key: "notifications_recent",
    titleAr: "آخر الإشعارات",
    titleEn: "Recent notifications",
    descriptionAr: "آخر 5 إشعارات غير مقروءة",
    descriptionEn: "Last 5 unread notifications",
    requiredPerms: ["notifications.view_own"],
    size: "md",
  },
];

/** Defaults injected on first visit if the user hasn't customised their dashboard. */
export const DEFAULT_WIDGETS_BY_ROLE: Record<string, string[]> = {
  agent: ["schedule_today", "apr_latest", "scorecards_recent", "qc_summary", "notifications_recent"],
  supervisor: ["schedule_week", "qc_summary", "qc_pass_rates", "scorecards_recent", "notifications_recent"],
  quality: ["qc_summary", "qc_pass_rates", "notifications_recent"],
  wfm: ["schedule_week", "apr_latest", "scorecards_recent", "notifications_recent"],
  project_manager: ["apr_latest", "scorecards_recent", "qc_summary", "notifications_recent"],
  admin: ["notifications_recent"],
  super_admin: ["notifications_recent"],
};
