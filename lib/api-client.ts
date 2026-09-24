"use client";
import { getPasscode } from "./db";
import { accessToken } from "./supabase";
import type { ApiResponse, BarcodeResult, ChatReply, ChatRequest, CoachRequest, CoachResult, Meal, ParseRequest, ParseResponse, PhotoParseRequest } from "./schemas";

const CLIENT_TIMEOUT_MS = 45_000; // server caps each LLM call at 20s; allow for the repair retry

async function post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: { code: "offline", message: "You're offline. Manual entry still works." } };
  }
  const [passcode, token] = await Promise.all([getPasscode(), accessToken()]);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(passcode ? { "x-app-passcode": passcode } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    return (await res.json()) as ApiResponse<T>;
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut
        ? { code: "timeout", message: "That took too long. Try again, or add it manually." }
        : { code: "offline", message: "Couldn't reach the server. Manual entry still works." },
    };
  }
}

export type AIStatus = { configured: boolean; provider?: string; models?: Record<"parse" | "vision" | "coach", string>; effort?: string; problem?: string };

export async function apiAIStatus(): Promise<AIStatus | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  try {
    const token = await accessToken();
    const res = await fetch("/api/ai-status", { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10_000) });
    const json = (await res.json()) as ApiResponse<AIStatus>;
    return json.ok ? json.data : null;
  } catch {
    return null;
  }
}

export const apiParse = (req: ParseRequest) => post<ParseResponse>("/api/parse", req);
export const apiParsePhoto = (req: PhotoParseRequest) => post<ParseResponse>("/api/parse-photo", req);
export const apiCoach = (req: CoachRequest) => post<CoachResult>("/api/coach", req);
export const apiChat = (req: ChatRequest) => post<ChatReply>("/api/chat", req);
export const apiBarcode = (code: string, meal: Meal) => post<BarcodeResult>("/api/barcode", { code, meal });
