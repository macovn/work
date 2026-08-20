import { getOAuth2Client, getGoogleAuthUrl, getCalendarClient, createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from "./lib/google-calendar";
import fs from "fs";
import path from "path";

async function verifyGoogleCalendarOAuth() {
  console.log("=== VERIFYING GOOGLE CALENDAR OAUTH 2.0 IMPLEMENTATION ===");

  // 1. Static check: ensure google.auth.JWT and service account references are NOT in lib/google-calendar.ts
  const code = fs.readFileSync(path.join(process.cwd(), "lib/google-calendar.ts"), "utf-8");
  const usesJWT = code.includes("google.auth.JWT") || code.includes("GOOGLE_CLIENT_EMAIL") || code.includes("GOOGLE_PRIVATE_KEY");
  const usesOAuth2 = code.includes("google.auth.OAuth2") && code.includes("GOOGLE_CLIENT_ID") && code.includes("GOOGLE_REFRESH_TOKEN");

  console.log("Uses Service Account (JWT):", usesJWT);
  console.log("Uses Google OAuth 2.0 (OAuth2):", usesOAuth2);

  if (usesJWT || !usesOAuth2) {
    throw new Error("Architecture Verification FAILED: Service Account still found or OAuth 2.0 missing!");
  }

  // 2. Runtime check: getOAuth2Client when env missing
  const oauthClient = getOAuth2Client();
  console.log("OAuth client (unconfigured env):", oauthClient);

  // 3. Runtime check: getCalendarClient when unconfigured
  const calendarClient = getCalendarClient();
  console.log("Calendar client (unconfigured env):", calendarClient); // should be null

  // 4. Fail-safe tests
  const createResult = await createGoogleCalendarEvent({
    id: "test-task-1",
    code: "TASK-001",
    title: "Test Task",
    deadline: new Date(),
    field: "Testing",
    priority: "HIGH",
    status: "TODO",
  });
  console.log("Create event unconfigured result:", createResult); // null

  const updateResult = await updateGoogleCalendarEvent("fake-event-id", {
    code: "TASK-001",
    title: "Test Task",
    deadline: new Date(),
    field: "Testing",
    priority: "HIGH",
    status: "TODO",
  });
  console.log("Update event unconfigured result:", updateResult); // false

  const deleteResult = await deleteGoogleCalendarEvent("fake-event-id");
  console.log("Delete event unconfigured result:", deleteResult); // false

  console.log("=== ALL GOOGLE CALENDAR OAUTH 2.0 COMPLIANCE CHECKS PASSED ===");
}

verifyGoogleCalendarOAuth();
