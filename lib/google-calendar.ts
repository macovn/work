import { google } from "googleapis";

/**
 * Creates and configures Google OAuth 2.0 client strictly adhering to Contract V1.2
 */
export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates Google OAuth 2.0 consent URL for offline access & Calendar scopes
 */
export function getGoogleAuthUrl(): string | null {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) return null;

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
  });
}

/**
 * Returns an authenticated Google Calendar API instance via OAuth 2.0
 */
export function getCalendarClient() {
  const oauth2Client = getOAuth2Client();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!oauth2Client || !refreshToken) {
    return null;
  }

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function createGoogleCalendarEvent(task: {
  id: string;
  code: string;
  title: string;
  deadline: Date;
  field: string;
  priority: string;
  status: string;
  notes?: string | null;
}): Promise<string | null> {
  try {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    if (!calendar) {
      console.warn("[Google Calendar Sync] Google OAuth 2.0 credentials missing or incomplete. Sync skipped safely.");
      return null;
    }

    const startDate = new Date(task.deadline);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `[${task.code}] ${task.title}`,
        description: `Mã CV: ${task.code}\nLĩnh vực: ${task.field}\nĐộ ưu tiên: ${task.priority}\nTrạng thái: ${task.status}\nGhi chú: ${task.notes || "Không có"}`,
        start: {
          dateTime: startDate.toISOString(),
        },
        end: {
          dateTime: endDate.toISOString(),
        },
      },
    });

    return res.data.id || null;
  } catch (error: any) {
    console.error("[Google Calendar Create Event Error]:", error?.message || error);
    return null;
  }
}

export async function updateGoogleCalendarEvent(
  googleEventId: string,
  task: {
    code: string;
    title: string;
    deadline: Date;
    field: string;
    priority: string;
    status: string;
    notes?: string | null;
  }
): Promise<boolean> {
  try {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    if (!calendar || !googleEventId) {
      return false;
    }

    const startDate = new Date(task.deadline);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    await calendar.events.patch({
      calendarId,
      eventId: googleEventId,
      requestBody: {
        summary: `[${task.code}] ${task.title}`,
        description: `Mã CV: ${task.code}\nLĩnh vực: ${task.field}\nĐộ ưu tiên: ${task.priority}\nTrạng thái: ${task.status}\nGhi chú: ${task.notes || "Không có"}`,
        start: {
          dateTime: startDate.toISOString(),
        },
        end: {
          dateTime: endDate.toISOString(),
        },
      },
    });

    return true;
  } catch (error: any) {
    console.error("[Google Calendar Update Event Error]:", error?.message || error);
    return false;
  }
}

export async function deleteGoogleCalendarEvent(googleEventId: string): Promise<boolean> {
  try {
    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

    if (!calendar || !googleEventId) {
      return false;
    }

    await calendar.events.delete({
      calendarId,
      eventId: googleEventId,
    });

    return true;
  } catch (error: any) {
    console.error("[Google Calendar Delete Event Error]:", error?.message || error);
    return false;
  }
}
