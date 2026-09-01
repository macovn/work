import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { sendZaloNotification } from "./zalo";
import { sendWebPushNotification } from "./web-push";
import { formatDate, formatPriority } from "./utils";

// ==========================================
// 1. Domain Types & Interfaces (DIP & OCP)
// ==========================================

export type NotificationType = "WARNING" | "OVERDUE" | "LOGIN_ALERT";

export interface ChannelContext {
  user: any;
  task: any;
  notificationType: NotificationType;
  ruleKey: string;
  deadline: Date;
  subject: string;
  bodyText: string;
  taskUrl: string;
  deadlineFormatted: string;
  priorityFormatted: string;
}

export interface NotificationChannelHandler {
  channelName: string;
  isEnabled(settings: any, user: any): boolean;
  send(ctx: ChannelContext): Promise<void>;
}

// ==========================================
// 2. Notification Formatters (SRP)
// ==========================================

function escapeHtml(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class NotificationFormatter {
  static buildContent(user: any, task: any, notificationType: NotificationType): { subject: string; bodyText: string; taskUrl: string } {
    const taskTitle = task.title;
    const deadlineFormatted = formatDate(task.deadline);
    const priorityFormatted = formatPriority(task.priority);
    const taskUrl = `/tasks?id=${task.id}`;

    let subject = "";
    let bodyText = "";

    if (notificationType === "OVERDUE") {
      subject = `[CẢNH BÁO QUÁ HẠN] Công việc: ${task.code} - ${taskTitle}`;
      bodyText = `Công việc "${taskTitle}" (Mã: ${task.code}) được giao cho bạn đã QUÁ HẠN vào lúc ${deadlineFormatted}. Mức độ ưu tiên: ${priorityFormatted}. Vui lòng cập nhật kết quả gấp.`;
    } else if (notificationType === "WARNING") {
      subject = `[CẢNH BÁO CẬN HẠN] Công việc: ${task.code} - ${taskTitle}`;
      bodyText = `Công việc "${taskTitle}" (Mã: ${task.code}) sắp đến hạn hoàn thành vào ${deadlineFormatted}. Mức độ ưu tiên: ${priorityFormatted}.`;
    } else {
      subject = `[CẢNH BÁO KHI ĐĂNG NHẬP] Công việc cần chú ý: ${task.code}`;
      bodyText = `Xin chào ${user.fullName}, bạn có công việc "${taskTitle}" (Mã: ${task.code}) sắp/đã đến hạn vào ${deadlineFormatted}.`;
    }

    return { subject, bodyText, taskUrl };
  }

  static buildEmailHtml(user: any, task: any, subject: string, bodyText: string, taskUrl: string): string {
    const deadlineFormatted = formatDate(task.deadline);
    const priorityFormatted = formatPriority(task.priority);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const safeSubject = escapeHtml(subject);
    const safeFullName = escapeHtml(user.fullName);
    const safeBodyText = escapeHtml(bodyText);
    const safeCode = escapeHtml(task.code);
    const safeTitle = escapeHtml(task.title);
    const safeField = escapeHtml(task.field);
    const safeDeadline = escapeHtml(deadlineFormatted);
    const safePriority = escapeHtml(priorityFormatted);
    const safeUrl = encodeURI(`${baseUrl}${taskUrl}`);

    return `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #e53e3e;">${safeSubject}</h2>
          <p>Xin chào <strong>${safeFullName}</strong>,</p>
          <p>${safeBodyText}</p>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Mã CV:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${safeCode}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Tên công việc:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${safeTitle}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Lĩnh vực:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${safeField}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Hạn hoàn thành:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7; color: #c53030; font-weight: bold;">${safeDeadline}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Mức độ ưu tiên:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${safePriority}</td></tr>
          </table>
          <p style="margin-top: 20px;">
            <a href="${safeUrl}" style="background-color: #3182ce; color: white; padding: 10px 18px; text-decoration: none; border-radius: 5px; display: inline-block;">Xem chi tiết công việc</a>
          </p>
        </div>
      `;
  }
}

// ==========================================
// 3. Channel Handlers (OCP & SRP)
// ==========================================

export class InAppChannelHandler implements NotificationChannelHandler {
  channelName = "IN_APP";

  isEnabled(): boolean {
    return true; // Always enabled
  }

  async send(ctx: ChannelContext): Promise<void> {
    await prisma.inAppNotification.create({
      data: {
        userId: ctx.user.id,
        taskId: ctx.task.id,
        title: ctx.subject,
        message: ctx.bodyText,
      },
    });

    await prisma.notificationLog.create({
      data: {
        userId: ctx.user.id,
        taskId: ctx.task.id,
        notificationType: ctx.notificationType,
        channel: "IN_APP",
        ruleKey: ctx.ruleKey,
        deadline: ctx.deadline,
        sentAt: new Date(),
        status: "SENT",
      },
    });
  }
}

export class WebPushChannelHandler implements NotificationChannelHandler {
  channelName = "WEB_PUSH";

  isEnabled(settings: any): boolean {
    return Boolean(settings.enablePush);
  }

  async send(ctx: ChannelContext): Promise<void> {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: ctx.user.id },
    });

    for (const sub of subscriptions) {
      const result = await sendWebPushNotification(sub.keys, {
        title: ctx.subject,
        body: ctx.bodyText,
        url: ctx.taskUrl,
        taskId: ctx.task.id,
      });

      await prisma.notificationLog.create({
        data: {
          userId: ctx.user.id,
          taskId: ctx.task.id,
          notificationType: ctx.notificationType,
          channel: "WEB_PUSH",
          ruleKey: ctx.ruleKey,
          deadline: ctx.deadline,
          sentAt: result.success ? new Date() : null,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.error,
        },
      });
    }
  }
}

export class EmailChannelHandler implements NotificationChannelHandler {
  channelName = "EMAIL";

  isEnabled(settings: any, user: any): boolean {
    return Boolean(settings.enableEmail && user.email);
  }

  async send(ctx: ChannelContext): Promise<void> {
    const emailHtml = NotificationFormatter.buildEmailHtml(
      ctx.user,
      ctx.task,
      ctx.subject,
      ctx.bodyText,
      ctx.taskUrl
    );

    const result = await sendEmail({
      to: ctx.user.email,
      subject: ctx.subject,
      html: emailHtml,
    });

    await prisma.notificationLog.create({
      data: {
        userId: ctx.user.id,
        taskId: ctx.task.id,
        notificationType: ctx.notificationType,
        channel: "EMAIL",
        ruleKey: ctx.ruleKey,
        deadline: ctx.deadline,
        sentAt: result.success ? new Date() : null,
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.error,
      },
    });
  }
}

export class ZaloChannelHandler implements NotificationChannelHandler {
  channelName = "ZALO";

  isEnabled(settings: any): boolean {
    return Boolean(settings.enableZalo);
  }

  async send(ctx: ChannelContext): Promise<void> {
    const result = await sendZaloNotification({
      phoneOrUserZaloId: ctx.user.email,
      message: `${ctx.subject}\n${ctx.bodyText}`,
    });

    await prisma.notificationLog.create({
      data: {
        userId: ctx.user.id,
        taskId: ctx.task.id,
        notificationType: ctx.notificationType,
        channel: "ZALO",
        ruleKey: ctx.ruleKey,
        deadline: ctx.deadline,
        sentAt: result.success ? new Date() : null,
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.error,
      },
    });
  }
}

// Default Channels Registry
const DEFAULT_CHANNELS: NotificationChannelHandler[] = [
  new InAppChannelHandler(),
  new WebPushChannelHandler(),
  new EmailChannelHandler(),
  new ZaloChannelHandler(),
];

// ==========================================
// 4. Task Rule Evaluator Helper (DRY)
// ==========================================

export class NotificationRuleEvaluator {
  static evaluateTask(
    task: any,
    settings: any,
    now: Date,
    isLoginAlert = false
  ): { notificationType: NotificationType; ruleKey: string } | null {
    const deadline = new Date(task.deadline);
    const isOverdue = now > deadline;

    if (isOverdue) {
      return {
        notificationType: isLoginAlert ? "LOGIN_ALERT" : "OVERDUE",
        ruleKey: isLoginAlert ? "LOGIN_ALERT_OVERDUE" : "OVERDUE",
      };
    }

    let warningWindowHours = settings.priorityLowHours;
    if (task.priority === "MEDIUM") warningWindowHours = settings.priorityMediumHours;
    if (task.priority === "HIGH") warningWindowHours = settings.priorityHighHours;

    const warningThreshold = new Date(deadline.getTime() - warningWindowHours * 60 * 60 * 1000);

    if (now >= warningThreshold && now < deadline) {
      const prefix = isLoginAlert ? "LOGIN_ALERT" : "WARNING";
      return {
        notificationType: isLoginAlert ? "LOGIN_ALERT" : "WARNING",
        ruleKey: `${prefix}_${task.priority}_${warningWindowHours}H`,
      };
    }

    return null; // Not eligible
  }
}

// ==========================================
// 5. Main NotificationEngine Class
// ==========================================

export class NotificationEngine {
  private static channels: NotificationChannelHandler[] = DEFAULT_CHANNELS;

  /**
   * Get system default/custom settings for notification warning windows
   */
  static async getSettings() {
    let setting = await prisma.notificationSetting.findUnique({
      where: { id: "default" },
    });

    if (!setting) {
      setting = await prisma.notificationSetting.create({
        data: {
          id: "default",
          priorityLowHours: 4,
          priorityMediumHours: 24,
          priorityHighHours: 48,
          enableEmail: true,
          enableZalo: true,
          enablePush: true,
          googleCalendarEnabled: true,
        },
      });
    }

    return setting;
  }

  /**
   * Evaluate all active tasks and dispatch warnings/overdue notifications
   */
  static async evaluateAndTriggerNotifications() {
    const settings = await this.getSettings();
    const now = new Date();

    const activeTasks = await prisma.task.findMany({
      where: {
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
      include: {
        assignee: true,
      },
    });

    for (const task of activeTasks) {
      const evaluation = NotificationRuleEvaluator.evaluateTask(task, settings, now, false);
      if (evaluation) {
        await this.dispatchNotificationIfEligible({
          user: task.assignee,
          task,
          notificationType: evaluation.notificationType,
          ruleKey: evaluation.ruleKey,
          deadline: new Date(task.deadline),
          settings,
        });
      }
    }
  }

  /**
   * Specifically handles Login Alert when a user logs in successfully
   */
  static async handleLoginAlert(userId: string) {
    const settings = await this.getSettings();
    const now = new Date();

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status === "LOCKED") return;

    const userTasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
    });

    for (const task of userTasks) {
      const evaluation = NotificationRuleEvaluator.evaluateTask(task, settings, now, true);
      if (evaluation) {
        await this.dispatchNotificationIfEligible({
          user,
          task,
          notificationType: evaluation.notificationType,
          ruleKey: evaluation.ruleKey,
          deadline: new Date(task.deadline),
          settings,
        });
      }
    }
  }

  /**
   * Internal deduplicated notification dispatcher using registered channels
   */
  private static async dispatchNotificationIfEligible(params: {
    user: any;
    task: any;
    notificationType: NotificationType;
    ruleKey: string;
    deadline: Date;
    settings: any;
  }) {
    const { user, task, notificationType, ruleKey, deadline, settings } = params;

    // Deduplication check
    const existingLog = await prisma.notificationLog.findFirst({
      where: {
        userId: user.id,
        taskId: task.id,
        notificationType,
        ruleKey,
        deadline,
        status: {
          in: ["SENT", "PENDING"],
        },
      },
    });

    if (existingLog) {
      return;
    }

    const { subject, bodyText, taskUrl } = NotificationFormatter.buildContent(user, task, notificationType);
    const deadlineFormatted = formatDate(deadline);
    const priorityFormatted = formatPriority(task.priority);

    const ctx: ChannelContext = {
      user,
      task,
      notificationType,
      ruleKey,
      deadline,
      subject,
      bodyText,
      taskUrl,
      deadlineFormatted,
      priorityFormatted,
    };

    for (const channel of this.channels) {
      if (!channel.isEnabled(settings, user)) continue;
      try {
        await channel.send(ctx);
      } catch (err: any) {
        // Cách ly lỗi: một kênh thất bại không được chặn các kênh còn lại
        console.error(
          `[NotificationEngine] Channel ${channel.channelName} failed for task ${task.code}:`,
          err?.message || err
        );
      }
    }
  }
}
