import nodemailer from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || '"Quản lý công việc" <noreply@example.com>';

    if (!host || !user || !pass) {
      console.warn("[Email Engine] SMTP credentials not fully configured. Email skipped.");
      return { success: false, error: "SMTP credentials missing in environment variables" };
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    return { success: true };
  } catch (error: any) {
    console.error("[Email Engine Error]:", error?.message || error);
    return { success: false, error: error?.message || "Failed to send email" };
  }
}
