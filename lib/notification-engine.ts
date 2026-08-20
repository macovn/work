import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { sendZaloNotification } from "./zalo";
import { sendWebPushNotification } from "./web-push";
import { formatDate, formatPriority } from "./utils";

export class NotificationEngine {
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

    // Query non-completed, non-cancelled tasks
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
      const deadline = new Date(task.deadline);
      const isOverdue = now > deadline;

      if (isOverdue) {
        // OVERDUE check
        const ruleKey = "OVERDUE";
        await this.dispatchNotificationIfEligible({
          user: task.assignee,
          task,
          notificationType: "OVERDUE",
          ruleKey,
          deadline,
          settings,
        });
      } else {
        // WARNING window check based on priority (X/Y/Z)
        let warningWindowHours = settings.priorityLowHours;
        if (task.priority === "MEDIUM") warningWindowHours = settings.priorityMediumHours;
        if (task.priority === "HIGH") warningWindowHours = settings.priorityHighHours;

        const warningThreshold = new Date(deadline.getTime() - warningWindowHours * 60 * 60 * 1000);

        if (now >= warningThreshold && now < deadline) {
          const ruleKey = `WARNING_${task.priority}_${warningWindowHours}H`;
          await this.dispatchNotificationIfEligible({
            user: task.assignee,
            task,
            notificationType: "WARNING",
            ruleKey,
            deadline,
            settings,
          });
        }
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

    // Fetch user's pending tasks
    const userTasks = await prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: {
          notIn: ["COMPLETED", "CANCELLED"],
        },
      },
    });

    for (const task of userTasks) {
      const deadline = new Date(task.deadline);
      const isOverdue = now > deadline;

      if (isOverdue) {
        const ruleKey = "LOGIN_ALERT_OVERDUE";
        await this.dispatchNotificationIfEligible({
          user,
          task,
          notificationType: "LOGIN_ALERT",
          ruleKey,
          deadline,
          settings,
        });
      } else {
        let warningWindowHours = settings.priorityLowHours;
        if (task.priority === "MEDIUM") warningWindowHours = settings.priorityMediumHours;
        if (task.priority === "HIGH") warningWindowHours = settings.priorityHighHours;

        const warningThreshold = new Date(deadline.getTime() - warningWindowHours * 60 * 60 * 1000);

        if (now >= warningThreshold && now < deadline) {
          const ruleKey = `LOGIN_ALERT_${task.priority}_${warningWindowHours}H`;
          await this.dispatchNotificationIfEligible({
            user,
            task,
            notificationType: "LOGIN_ALERT",
            ruleKey,
            deadline,
            settings,
          });
        }
      }
    }
  }

  /**
   * Internal deduplicated notification dispatcher
   */
  private static async dispatchNotificationIfEligible(params: {
    user: any;
    task: any;
    notificationType: "WARNING" | "OVERDUE" | "LOGIN_ALERT";
    ruleKey: string;
    deadline: Date;
    settings: any;
  }) {
    const { user, task, notificationType, ruleKey, deadline, settings } = params;

    // Check if notification already logged/sent for this exact combination
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
      // Already sent -> skip to prevent duplicates
      return;
    }

    const taskTitle = task.title;
    const deadlineFormatted = formatDate(deadline);
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

    // 1. In-App Notification (Always enabled)
    await prisma.inAppNotification.create({
      data: {
        userId: user.id,
        taskId: task.id,
        title: subject,
        message: bodyText,
      },
    });

    await prisma.notificationLog.create({
      data: {
        userId: user.id,
        taskId: task.id,
        notificationType,
        channel: "IN_APP",
        ruleKey,
        deadline,
        sentAt: new Date(),
        status: "SENT",
      },
    });

    // 2. Web Push Notification
    if (settings.enablePush) {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: user.id },
      });

      for (const sub of subscriptions) {
        const result = await sendWebPushNotification(sub.keys, {
          title: subject,
          body: bodyText,
          url: taskUrl,
          taskId: task.id,
        });

        await prisma.notificationLog.create({
          data: {
            userId: user.id,
            taskId: task.id,
            notificationType,
            channel: "WEB_PUSH",
            ruleKey,
            deadline,
            sentAt: result.success ? new Date() : null,
            status: result.success ? "SENT" : "FAILED",
            errorMessage: result.error,
          },
        });
      }
    }

    // 3. Email Notification
    if (settings.enableEmail && user.email) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #e53e3e;">${subject}</h2>
          <p>Xin chào <strong>${user.fullName}</strong>,</p>
          <p>${bodyText}</p>
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Mã CV:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${task.code}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Tên công việc:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${task.title}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Lĩnh vực:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${task.field}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Hạn hoàn thành:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7; color: #c53030; font-weight: bold;">${deadlineFormatted}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #edf2f7; font-weight: bold;">Mức độ ưu tiên:</td><td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${priorityFormatted}</td></tr>
          </table>
          <p style="margin-top: 20px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${taskUrl}" style="background-color: #3182ce; color: white; padding: 10px 18px; text-decoration: none; border-radius: 5px; display: inline-block;">Xem chi tiết công việc</a>
          </p>
        </div>
      `;

      const result = await sendEmail({
        to: user.email,
        subject,
        html: emailHtml,
      });

      await prisma.notificationLog.create({
        data: {
          userId: user.id,
          taskId: task.id,
          notificationType,
          channel: "EMAIL",
          ruleKey,
          deadline,
          sentAt: result.success ? new Date() : null,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.error,
        },
      });
    }

    // 4. Zalo Notification
    if (settings.enableZalo) {
      const result = await sendZaloNotification({
        phoneOrUserZaloId: user.email, // or user Zalo ID
        message: `${subject}\n${bodyText}`,
      });

      await prisma.notificationLog.create({
        data: {
          userId: user.id,
          taskId: task.id,
          notificationType,
          channel: "ZALO",
          ruleKey,
          deadline,
          sentAt: result.success ? new Date() : null,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.error,
        },
      });
    }
  }
}
