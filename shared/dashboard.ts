// Catalog of every dashboard widget the user can pin to their home page.
// The frontend renders the actual UI; this is the shared metadata.

export type WidgetSize = "sm" | "md" | "lg" | "xl";

export interface DashboardWidgetDef {
  key: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  // Any one of these permission keys is enough.
  requiredPerms: string[];
  size: WidgetSize;
}

// ─── Pinned widget instance + custom widget config ───────────────────────────

/** A single pin on the user's dashboard. key references a catalog widget or
 *  a custom widget (key starts with "custom:"). size overrides the default. */
export interface PinnedWidget {
  key: string;
  size?: WidgetSize;
}

export type CustomWidgetSource =
  | "apr" | "qc" | "schedule"           // data-driven KPIs
  | "text" | "shape" | "image";         // free-form building blocks

export type TextAlign = "start" | "center" | "end";
export type TextSize = "sm" | "md" | "lg" | "xl" | "2xl";
export type ShapeKind = "rectangle" | "circle" | "divider";
export type ImageFit = "contain" | "cover";

/** Settings the user picks when building a custom widget. */
export interface CustomWidget {
  id: string;
  titleAr: string;
  titleEn: string;
  source: CustomWidgetSource;
  // APR: pick a metric and aggregation
  aprMetric?: string;
  aprAggregation?: "latest" | "average";
  // QC: pick a counter
  qcMetric?: "total" | "approved" | "rejected" | "pending"
           | "internal_rate" | "external_rate" | "csat_rate";
  qcPeriod?: "current_month" | "all";
  // Schedule: pick what to show
  scheduleMetric?: "today_shift" | "today_break" | "week_offs" | "week_working_days";
  // Text widget: free note / heading with colour & alignment
  text?: {
    ar: string;
    en: string;
    color?: string;      // hex — the text colour
    bg?: string;         // hex — optional background
    align?: TextAlign;
    size?: TextSize;
    bold?: boolean;
  };
  // Shape widget: coloured block for visual sectioning
  shape?: {
    kind: ShapeKind;
    color: string;       // hex
  };
  // Image widget: external URL
  image?: {
    url: string;
    alt?: string;
    fit?: ImageFit;
  };
}

export interface DashboardState {
  pinned: PinnedWidget[];
  customs: CustomWidget[];
}

/** Map size → Tailwind grid span (6-column grid).  */
export const SIZE_TO_COL: Record<WidgetSize, string> = {
  sm: "lg:col-span-1",
  md: "lg:col-span-2",
  lg: "lg:col-span-3",
  xl: "lg:col-span-6",
};

/** Required permission for each custom-widget source. Free-form widgets
 *  (text / shape / image) are available to anyone signed in. */
export const CUSTOM_SOURCE_PERMS: Record<CustomWidgetSource, string[]> = {
  apr: ["apr.view_own", "apr.view_team", "apr.view_project", "apr.view_all"],
  qc:  ["qc.view_own", "qc.evaluate", "qc.approve", "qc.approve_team"],
  schedule: ["schedule.view_own", "schedule.view_team", "schedule.view_project", "schedule.manage"],
  text:  ["notifications.view_own"],  // any authenticated user
  shape: ["notifications.view_own"],
  image: ["notifications.view_own"],
};

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
