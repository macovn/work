export interface ZaloMessageOptions {
  phoneOrUserZaloId: string;
  message: string;
}

export async function sendZaloNotification(options: ZaloMessageOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const appId = process.env.ZALO_OA_APP_ID;
    const secret = process.env.ZALO_OA_SECRET;
    const accessToken = process.env.ZALO_OA_ACCESS_TOKEN;

    if (!appId || !accessToken) {
      console.warn("[Zalo Engine] Zalo OA credentials not fully configured. Zalo notification skipped.");
      return { success: false, error: "Zalo OA credentials missing in environment variables" };
    }

    // Call Zalo Open API endpoint for ZBS / Official Account message dispatch
    const response = await fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: accessToken,
      },
      body: JSON.stringify({
        recipient: {
          user_id: options.phoneOrUserZaloId,
        },
        message: {
          text: options.message,
        },
      }),
    });

    const data = await response.json();

    if (data.error !== 0) {
      return { success: false, error: data.message || `Zalo API Error Code: ${data.error}` };
    }

    return { success: true };
  } catch (error: any) {
    console.error("[Zalo Engine Error]:", error?.message || error);
    return { success: false, error: error?.message || "Failed to send Zalo notification" };
  }
}
