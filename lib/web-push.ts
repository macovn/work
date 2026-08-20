import webPush from "web-push";

export async function sendWebPushNotification(
  subscriptionJson: string,
  payload: {
    title: string;
    body: string;
    url: string;
    taskId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

    if (!vapidPublicKey || !vapidPrivateKey || vapidPublicKey.includes("...")) {
      return { success: false, error: "VAPID keys not validly configured in environment" };
    }

    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const subscription = JSON.parse(subscriptionJson);
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (error: any) {
    console.error("[Web Push Error]:", error?.message || error);
    return { success: false, error: error?.message || "Failed to send web push" };
  }
}
