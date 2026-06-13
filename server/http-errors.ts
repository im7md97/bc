import type { Response } from "express";

// Standard error shape (§13):
// { error: { code, message_ar, message_en, details? } }
export function sendError(
  res: Response,
  status: number,
  code: string,
  messageAr: string,
  messageEn: string,
  details?: unknown,
) {
  return res.status(status).json({
    error: {
      code,
      message_ar: messageAr,
      message_en: messageEn,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

export const errInternal = (res: Response, details?: unknown) =>
  sendError(res, 500, "internal_error", "حدث خطأ في الخادم", "Internal server error", details);

export const errNotFound = (res: Response) =>
  sendError(res, 404, "not_found", "العنصر غير موجود", "Not found");

export const errInvalidId = (res: Response) =>
  sendError(res, 400, "invalid_id", "معرّف غير صالح", "Invalid ID");
