import webPush from "web-push";

export async function sendWebPushNotification(
  subscriptionJsonOrKeys: string,
  payload: {
    title: string;
    body: string;
    url: string;
    taskId?: string;
  },
  endpoint?: string
): Promise<{ success: boolean; error?: string; gone?: boolean }> {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

    if (!vapidPublicKey || !vapidPrivateKey || vapidPublicKey.includes("...")) {
      return { success: false, error: "VAPID keys not validly configured in environment" };
    }

    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const parsed = JSON.parse(subscriptionJsonOrKeys);
    const subscription = parsed.endpoint
      ? parsed
      : { endpoint, keys: parsed.keys || parsed };

    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (error: any) {
    const statusCode = error?.statusCode;
    const gone = statusCode === 404 || statusCode === 410;
    console.error("[Web Push Error]:", error?.message || error);
    return { success: false, error: error?.message || "Failed to send web push", gone };
  }
}
