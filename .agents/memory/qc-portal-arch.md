---
name: QC Portal Architecture
description: Roles, entry workflow, schema tables, and key constraints for the Quality Control Portal
---

## Roles
- `quality` — creates entries (pending_supervisor status)
- `supervisor` — approves/rejects entries; views schedules
- `agent` — views approved entries + personal schedule
- `admin` — full access
- `manager` — same as admin: user management, project management, views all entries
- `wfm` — Workforce Management: full CRUD on schedules + breaks management (Breaks tab in Schedule page); also views users list

ADMIN_ROLES = ["admin", "manager"] used throughout routes.ts
SCHEDULE_ROLES = ["admin", "manager", "supervisor", "wfm"] for schedule/breaks access

## Entry Workflow
quality creates → pending_supervisor → supervisor reviews → approved/rejected
Quality can resubmit rejected entries with a qualityNote.

## DB Tables
- `entries` — QC call records
- `system_users` — all portal users (passwordHash stored, omitted from API responses)
- `projects` — project management (admin/manager CRUD)
- `schedules` — WFM weekly schedules (shifts stored as JSON in `shiftsJson` text column)

**Why:** shiftsJson stores a `WeeklyShifts` object keyed by day name (monday/tuesday/…), each day has `{start, end, breakStart, breakEnd, isOff}`.

## Hooks File Convention
- `client/src/hooks/use-wfm.ts` — single merged file for ALL projects + schedules hooks
  - Exports: useProjects, useCreateProject, useUpdateProject, useDeleteProject
  - Exports: useSchedules, useSchedulesByAgent, useSaveSchedule, useDeleteSchedule
  - Projects.tsx and Schedule.tsx both import from `@/hooks/use-wfm`
  - `use-projects.ts` and `use-schedules.ts` have been deleted

**Why:** Reducing file count — related WFM hooks merged into one file.

## Key Constraints
- `InsertSchedule` type (drizzle-zod) does NOT include `updatedAt` — set it directly in `.set()` inside storage.ts, not in the partial input type.
- `DropdownMenuContent` from shadcn does not accept `dir` prop — omit it.
- Use `Array.from(new Set(...))` not spread operator for Set iteration (TS target).
- `DeleteAlertModal` props: `isOpen`, `entryId`, `onClose` (not `open`/`entry`/`onOpenChange`).
- Vite hot reload works in dev; no special config needed.
- Default admin seeded on first startup: username=admin, password=admin123.

## Nav by Role
- agent: Dashboard + Schedule (personal)
- supervisor: Dashboard + Schedule (all agents)
- quality: Dashboard (with Add Entry button)
- admin/manager: Dashboard + Schedule + Projects + Users
- wfm: Dashboard + Schedule (Schedules tab + Breaks tab with full grid view)

## Schedule Page Tabs (wfm/admin/manager only)
- Tab 1 "Schedules" — weekly shift editor per agent
- Tab 2 "البركيات / Breaks" — grid view of all agents × all days showing break times; click Edit to open shift editor for that agent
