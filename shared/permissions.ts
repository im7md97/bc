import type { Role } from "./schema";

// Every permission key known to the system, with bilingual labels for the
// Super Admin matrix UI. Scoped variants (e.g. view_project vs view_all) are
// separate keys so the server never needs to branch on raw role names.
export const PERMISSION_DEFS: { key: string; labelAr: string; labelEn: string; group: string }[] = [
  { key: "user.create",            labelAr: "إنشاء مستخدمين",                 labelEn: "Create users",                    group: "users" },
  { key: "user.create_agent",      labelAr: "إنشاء حسابات وكلاء فقط",          labelEn: "Create agent accounts only",      group: "users" },
  { key: "user.delete",            labelAr: "حذف مستخدمين",                   labelEn: "Delete users",                    group: "users" },
  { key: "user.delete_agent",      labelAr: "حذف حسابات وكلاء فقط",            labelEn: "Delete agent accounts only",      group: "users" },
  { key: "user.list_all",          labelAr: "عرض كل المستخدمين",              labelEn: "List all users",                  group: "users" },

  { key: "project.create",         labelAr: "إنشاء مشاريع",                   labelEn: "Create projects",                 group: "projects" },
  { key: "project.edit",           labelAr: "تعديل أي مشروع",                 labelEn: "Edit any project",                group: "projects" },
  { key: "project.edit_own",       labelAr: "تعديل مشاريعه فقط",              labelEn: "Edit own projects",               group: "projects" },

  { key: "agent.create",           labelAr: "إضافة وكلاء",                    labelEn: "Create agents",                   group: "agents" },
  { key: "agent.delete",           labelAr: "حذف وكلاء",                      labelEn: "Delete agents",                   group: "agents" },
  { key: "agent.list_all",         labelAr: "عرض كل الوكلاء",                 labelEn: "List all agents",                 group: "agents" },
  { key: "agent.list_project",     labelAr: "عرض وكلاء مشروعه",               labelEn: "List project agents",             group: "agents" },
  { key: "agent.list_team",        labelAr: "عرض وكلاء فريقه",                labelEn: "List team agents",                group: "agents" },

  { key: "apr.upload",             labelAr: "رفع تقرير APR اليومي",            labelEn: "Upload daily APR",                group: "apr" },
  { key: "apr.view_all",           labelAr: "عرض كل بيانات APR",              labelEn: "View all APR",                    group: "apr" },
  { key: "apr.view_project",       labelAr: "عرض APR مشروعه",                 labelEn: "View project APR",                group: "apr" },
  { key: "apr.view_team",          labelAr: "عرض APR فريقه",                  labelEn: "View team APR",                   group: "apr" },
  { key: "apr.view_own",           labelAr: "عرض APR الخاص به",               labelEn: "View own APR",                    group: "apr" },
  { key: "apr.history_view",       labelAr: "عرض سجل رفعات APR",              labelEn: "View APR history",                group: "apr" },
  { key: "apr.export",             labelAr: "تصدير APR",                      labelEn: "Export APR",                      group: "apr" },

  { key: "scorecard.generate",     labelAr: "توليد بطاقات الأداء",             labelEn: "Generate score cards",            group: "scorecard" },
  { key: "scorecard.view_all",     labelAr: "عرض كل بطاقات الأداء",            labelEn: "View all score cards",            group: "scorecard" },
  { key: "scorecard.view_project", labelAr: "عرض بطاقات مشروعه",              labelEn: "View project score cards",        group: "scorecard" },
  { key: "scorecard.view_team",    labelAr: "عرض بطاقات فريقه",               labelEn: "View team score cards",           group: "scorecard" },
  { key: "scorecard.view_own",     labelAr: "عرض بطاقته الخاصة",              labelEn: "View own score card",             group: "scorecard" },
  { key: "scorecard.write_issues", labelAr: "كتابة الملاحظات والحلول",         labelEn: "Write issues & solutions",        group: "scorecard" },
  { key: "scorecard.send_to_agent",labelAr: "إرسال البطاقة للوكيل",            labelEn: "Send score card to agent",        group: "scorecard" },
  { key: "scorecard.confirm",      labelAr: "تأكيد استلام البطاقة",            labelEn: "Confirm score card",              group: "scorecard" },
  { key: "scorecard.grid_edit",    labelAr: "تعديل أوزان وشبكات التقييم",      labelEn: "Edit grids & weights",            group: "scorecard" },
  { key: "scorecard.export",       labelAr: "تصدير بطاقات الأداء",             labelEn: "Export score cards",              group: "scorecard" },

  { key: "schedule.manage",        labelAr: "إدارة جداول العمل الأسبوعية",     labelEn: "Manage weekly schedules",         group: "schedule" },
  { key: "schedule.view_team",     labelAr: "عرض جداول فريقه",                labelEn: "View team schedules",             group: "schedule" },
  { key: "schedule.view_project",  labelAr: "عرض جداول مشروعه",               labelEn: "View project schedules",          group: "schedule" },
  { key: "schedule.view_own",      labelAr: "عرض جدوله الخاص",                labelEn: "View own schedule",               group: "schedule" },
  { key: "schedule.import",        labelAr: "رفع جدول من Excel",              labelEn: "Import schedule from Excel",      group: "schedule" },
  { key: "schedule.policy_edit",   labelAr: "تعديل سياسة البريكات",            labelEn: "Edit break policy",               group: "schedule" },
  { key: "schedule.auto_breaks",   labelAr: "جدولة البريكات تلقائياً",          labelEn: "Auto-schedule breaks",            group: "schedule" },
  { key: "schedule.swap_request",  labelAr: "طلب تبديل جدول",                 labelEn: "Request shift swap",              group: "schedule" },
  { key: "schedule.swap_review_team", labelAr: "مراجعة طلبات تبديل فريقه",     labelEn: "Review team swap requests",       group: "schedule" },
  { key: "schedule.swap_approve",  labelAr: "اعتماد طلبات تبديل الجداول",       labelEn: "Approve shift swaps",             group: "schedule" },
  { key: "attendance.record",      labelAr: "تسجيل حضور الفريق",               labelEn: "Record team attendance",          group: "schedule" },
  { key: "attendance.view_team",   labelAr: "عرض حضور فريقه",                 labelEn: "View team attendance",            group: "schedule" },
  { key: "attendance.view_all",    labelAr: "عرض كل سجلات الحضور",            labelEn: "View all attendance",             group: "schedule" },
  { key: "attendance.view_own",    labelAr: "عرض حضوره الخاص",                labelEn: "View own attendance",             group: "schedule" },

  { key: "qc.evaluate",            labelAr: "إدخال تقييمات الجودة",            labelEn: "Create QC evaluations",           group: "qc" },
  { key: "qc.approve",             labelAr: "اعتماد أي تقييم جودة",            labelEn: "Approve any QC evaluation",       group: "qc" },
  { key: "qc.approve_team",        labelAr: "اعتماد تقييمات فريقه",            labelEn: "Approve team QC evaluations",     group: "qc" },
  { key: "qc.view_own",            labelAr: "عرض تقييماته المعتمدة",           labelEn: "View own approved evaluations",   group: "qc" },

  { key: "notifications.view_own", labelAr: "عرض إشعاراته",                   labelEn: "View own notifications",          group: "system" },
  { key: "feature_flag.toggle",    labelAr: "إدارة مفاتيح الميزات",            labelEn: "Toggle feature flags",            group: "system" },
  { key: "permission.grant",       labelAr: "إدارة الصلاحيات",                labelEn: "Grant permissions",               group: "system" },
];

export const ALL_PERMISSION_KEYS = PERMISSION_DEFS.map((p) => p.key);

// Default grant matrix (§5 of the spec). Seeded into permission_grants;
// Super Admin can change it live afterwards.
export const DEFAULT_GRANTS: Record<Role, string[]> = {
  super_admin: ALL_PERMISSION_KEYS,
  admin: [
    "user.create", "user.delete", "user.list_all",
    "project.create", "project.edit",
    "notifications.view_own",
  ],
  wfm: [
    "user.create_agent", "user.delete_agent", "user.list_all",
    "project.create", "project.edit",
    "agent.create", "agent.delete", "agent.list_all",
    "apr.upload", "apr.view_all", "apr.history_view", "apr.export",
    "scorecard.generate", "scorecard.view_all", "scorecard.grid_edit", "scorecard.export",
    "schedule.manage", "schedule.import", "schedule.policy_edit", "schedule.auto_breaks", "schedule.swap_approve",
    "attendance.view_all",
    "notifications.view_own",
  ],
  project_manager: [
    "project.edit_own",
    "agent.list_project",
    "apr.view_project", "apr.export",
    "scorecard.view_project", "scorecard.export",
    "schedule.view_project",
    "notifications.view_own",
  ],
  supervisor: [
    "agent.list_team",
    "apr.view_team", "apr.export",
    "scorecard.view_team", "scorecard.write_issues", "scorecard.send_to_agent", "scorecard.export",
    "schedule.view_team", "schedule.swap_review_team",
    "attendance.record", "attendance.view_team",
    "qc.approve_team",
    "notifications.view_own",
  ],
  quality: [
    "qc.evaluate",
    "notifications.view_own",
  ],
  agent: [
    "apr.view_own",
    "scorecard.view_own", "scorecard.confirm",
    "schedule.view_own", "schedule.swap_request",
    "attendance.view_own",
    "qc.view_own",
    "notifications.view_own",
  ],
};

// Default feature flags (§11.2).
export const DEFAULT_FEATURE_FLAGS: { key: string; labelAr: string; labelEn: string }[] = [
  { key: "menu.qc",                  labelAr: "قائمة تقييم الجودة",        labelEn: "QC menu" },
  { key: "menu.apr",                 labelAr: "قائمة تقارير الأداء APR",    labelEn: "APR menu" },
  { key: "menu.scorecards",          labelAr: "قائمة بطاقات الأداء",       labelEn: "Score Cards menu" },
  { key: "menu.projects",            labelAr: "قائمة المشاريع",            labelEn: "Projects menu" },
  { key: "menu.users",               labelAr: "قائمة المستخدمين",          labelEn: "Users menu" },
  { key: "menu.schedule",            labelAr: "قائمة جدول العمل",          labelEn: "Schedule menu" },
  { key: "apr.export",               labelAr: "تصدير APR إلى Excel",       labelEn: "APR Excel export" },
  { key: "scorecard.export",         labelAr: "تصدير بطاقات الأداء",        labelEn: "Score Card export" },
  { key: "scorecard.agent_comment",  labelAr: "تعليق الوكيل على البطاقة",   labelEn: "Agent comment on score card" },
  { key: "apr.history",              labelAr: "سجل رفعات APR",             labelEn: "APR history" },
  { key: "apr.bulk_upload",          labelAr: "رفع APR بالجملة",           labelEn: "APR bulk upload" },
];
