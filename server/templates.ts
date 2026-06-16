import type { Response } from "express";
import { sendXlsx } from "./excel";

/** Single-sheet templates with sample rows so the user can fill and re-upload. */
export function sendUsersTemplate(res: Response) {
  sendXlsx(res, "users-template.xlsx", [{
    name: "Users",
    rows: [
      { username: "wfm.example", email: "wfm@portal.test", role: "wfm",
        password: "ChangeMe_2026!", displayNameAr: "موظف القوى العاملة", displayNameEn: "WFM User" },
      { username: "supervisor.example", email: "sup@portal.test", role: "supervisor",
        password: "ChangeMe_2026!", displayNameAr: "المشرف", displayNameEn: "Supervisor" },
      { username: "quality.example", email: "qual@portal.test", role: "quality",
        password: "ChangeMe_2026!", displayNameAr: "موظف الجودة", displayNameEn: "Quality" },
      { username: "agent.example", email: "agent@portal.test", role: "agent",
        password: "ChangeMe_2026!", displayNameAr: "وكيل", displayNameEn: "Agent" },
    ],
  }]);
}

export function sendSchedulesTemplate(res: Response) {
  sendXlsx(res, "schedules-template.xlsx", [{
    name: "Schedules",
    rows: [
      { Emp: "ISC001", Sun: "08:00-16:00", Mon: "08:00-16:00", Tue: "08:00-16:00",
        Wed: "08:00-16:00", Thu: "08:00-16:00", Fri: "OFF", Sat: "OFF" },
      { Emp: "ISC002", Sun: "16:00-23:00", Mon: "16:00-23:00", Tue: "OFF",
        Wed: "16:00-23:00", Thu: "16:00-23:00", Fri: "16:00-23:00", Sat: "OFF" },
    ],
  }]);
}

export function sendAprTemplate(res: Response) {
  sendXlsx(res, "apr-template.xlsx", [{
    name: "APR",
    rows: [
      { Emp: "ISC001", "Inbound Calls": 45, "Outbound Calls": 12, "Ticket Handled": 50,
        "AHT": "0:05:30", "Talk Time": "3:30:00", "Hold Time": "0:15:00",
        "ACW Time": "0:30:00", "Average Staff Time": "8:00:00", "Net Login": "7:45:00",
        "Break Time": "1:00:00", "C-SAT": "92%", "D-SAT": "8%", "Tagging": "95%",
        "Schedule": "8:00:00", "Present": 22, "Absent": 0, "Absent %": "0%",
        "Total Non Adh": "0:15:00" },
      { Emp: "ISC002", "Inbound Calls": 38, "Outbound Calls": 5, "Ticket Handled": 41,
        "AHT": "0:06:10", "Talk Time": "2:50:00", "Hold Time": "0:08:00",
        "ACW Time": "0:25:00", "Average Staff Time": "7:30:00", "Net Login": "7:15:00",
        "Break Time": "0:45:00", "C-SAT": "88%", "D-SAT": "12%", "Tagging": "91%",
        "Schedule": "8:00:00", "Present": 21, "Absent": 1, "Absent %": "5%",
        "Total Non Adh": "0:20:00" },
    ],
  }]);
}
