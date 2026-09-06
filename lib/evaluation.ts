export type PerformanceRatingCode =
  | "EXCELLENT"
  | "GOOD"
  | "SATISFACTORY"
  | "UNSATISFACTORY"
  | "INSUFFICIENT_DATA";

export interface PerformanceRating {
  code: PerformanceRatingCode;
  label: string;
  badgeColor: string; // Tailwind color class for badges
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export const PERFORMANCE_RATINGS: Record<PerformanceRatingCode, PerformanceRating> = {
  EXCELLENT: {
    code: "EXCELLENT",
    label: "HOÀN THÀNH XUẤT SẮC NHIỆM VỤ",
    badgeColor: "bg-emerald-500 text-white",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-300",
  },
  GOOD: {
    code: "GOOD",
    label: "HOÀN THÀNH TỐT NHIỆM VỤ",
    badgeColor: "bg-blue-600 text-white",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-300",
  },
  SATISFACTORY: {
    code: "SATISFACTORY",
    label: "HOÀN THÀNH NHIỆM VỤ",
    badgeColor: "bg-amber-500 text-white",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-300",
  },
  UNSATISFACTORY: {
    code: "UNSATISFACTORY",
    label: "KHÔNG HOÀN THÀNH NHIỆM VỤ",
    badgeColor: "bg-red-600 text-white",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    borderColor: "border-red-300",
  },
  INSUFFICIENT_DATA: {
    code: "INSUFFICIENT_DATA",
    label: "CHƯA ĐỦ DỮ LIỆU ĐỂ ĐÁNH GIÁ",
    badgeColor: "bg-gray-400 text-white",
    bgColor: "bg-gray-50",
    textColor: "text-gray-600",
    borderColor: "border-gray-300",
  },
};

/**
 * Xếp loại tự động dựa trên Tổng điểm theo ngưỡng đã khóa:
 * - Từ 90.00 điểm trở lên: HOÀN THÀNH XUẤT SẮC NHIỆM VỤ
 * - Từ 70.00 điểm đến dưới 90.00 điểm: HOÀN THÀNH TỐT NHIỆM VỤ
 * - Từ 50.00 điểm đến dưới 70.00 điểm: HOÀN THÀNH NHIỆM VỤ
 * - Dưới 50.00 điểm: KHÔNG HOÀN THÀNH NHIỆM VỤ
 *
 * Ranh giới chính xác:
 * - 90.00 -> Xuất sắc | 89.99 -> Tốt
 * - 70.00 -> Tốt      | 69.99 -> Hoàn thành
 * - 50.00 -> Hoàn thành | 49.99 -> Không hoàn thành
 */
export function classifyPerformance(totalScore: number | null | undefined): PerformanceRating {
  if (totalScore === null || totalScore === undefined || isNaN(totalScore)) {
    return PERFORMANCE_RATINGS.INSUFFICIENT_DATA;
  }

  // Làm tròn tới 4 chữ số thập phân trước khi so sánh ngưỡng để tránh sai số dấu phẩy động
  const rounded = Number(totalScore.toFixed(4));

  if (rounded >= 90.0) {
    return PERFORMANCE_RATINGS.EXCELLENT;
  }
  if (rounded >= 70.0) {
    return PERFORMANCE_RATINGS.GOOD;
  }
  if (rounded >= 50.0) {
    return PERFORMANCE_RATINGS.SATISFACTORY;
  }
  return PERFORMANCE_RATINGS.UNSATISFACTORY;
}

export interface TaskEvaluationItem {
  id?: string;
  code?: string;
  title?: string;
  // Điểm đã được tính theo trọng số của nhiệm vụ (completedScore hoặc assignedScore hoặc điểm đầu vào)
  taskScore?: number | null;
  assignedScore?: number | null;
  completedScore?: number | null;
  // KPI % của nhiệm vụ (0 - 100)
  kpiScore?: number | null;
  status?: string;
}

export interface EvaluationResult {
  hasEnoughData: boolean;
  totalTasks: number;
  validScoreCount: number;
  validKpiCount: number;
  weightedAverageScore: number | null; // Điểm trung bình theo trọng số
  averageKpi: number | null; // KPI trung bình (%)
  totalScore: number | null; // Tổng điểm
  rating: PerformanceRating;
}

/**
 * Tính toán Đánh giá và Xếp loại kết quả theo đúng Work Order:
 * 
 * QUY TẮC BẮT BUỘC (đã chốt lại sau audit H4/M13):
 * - Chỉ các công việc có status = COMPLETED được đưa vào đánh giá.
 *   Task chưa hoàn thành / PAUSED / CANCELLED bị loại khỏi cả S_tb lẫn KPI_tb.
 * - Điểm của một task: ưu tiên taskScore > completedScore. KHÔNG dùng
 *   assignedScore làm điểm "đã thực hiện" (trước đây gây rating sai khi
 *   task chưa hoàn thành vẫn được tính trọn điểm giao).
 * - Trọng số đã được áp dụng trong quá trình hình thành điểm của các nhóm nhiệm vụ
 *   (chưa áp dụng JobTaskGroup.weight ở tầng này cho tới khi chốt công thức M13).
 * 
 * 1. ĐIỂM TRUNG BÌNH (S_tb):
 *    = Trung bình cộng của các điểm hợp lệ của task COMPLETED.
 * 2. KPI TRUNG BÌNH (KPI_tb):
 *    = Tổng KPI % / số task COMPLETED có KPI hợp lệ.
 * 3. TỔNG ĐIỂM (T):
 *    = S_tb * (KPI_tb / 100)
 * 4. XẾP LOẠI:
 *    = classifyPerformance(T)
 */
export function calculateEvaluation(tasks: TaskEvaluationItem[]): EvaluationResult {
  if (!tasks || tasks.length === 0) {
    return {
      hasEnoughData: false,
      totalTasks: 0,
      validScoreCount: 0,
      validKpiCount: 0,
      weightedAverageScore: null,
      averageKpi: null,
      totalScore: null,
      rating: PERFORMANCE_RATINGS.INSUFFICIENT_DATA,
    };
  }

  // Audit H4: chỉ giữ task COMPLETED (status undefined = caller không cung cấp -> giữ như cũ).
  const completedTasks = tasks.filter((t) => !t.status || t.status === "COMPLETED");

  // 1. Trích xuất danh sách điểm của các task COMPLETED hợp lệ
  // Ưu tiên: taskScore > completedScore (KHÔNG fallback assignedScore).
  const scoreValues: number[] = [];
  for (const t of completedTasks) {
    let s: number | null = null;
    if (typeof t.taskScore === "number" && !isNaN(t.taskScore)) {
      s = t.taskScore;
    } else if (typeof t.completedScore === "number" && !isNaN(t.completedScore)) {
      s = t.completedScore;
    }

    if (s !== null && s >= 0) {
      scoreValues.push(s);
    }
  }

  // 2. Trích xuất danh sách KPI % hợp lệ của các task COMPLETED
  const kpiValues: number[] = [];
  for (const t of completedTasks) {
    if (typeof t.kpiScore === "number" && !isNaN(t.kpiScore) && t.kpiScore >= 0) {
      kpiValues.push(t.kpiScore);
    }
  }

  // Điều kiện đánh giá: Phải có ít nhất 1 điểm hợp lệ VÀ ít nhất 1 KPI hợp lệ
  if (scoreValues.length === 0 || kpiValues.length === 0) {
    return {
      hasEnoughData: false,
      totalTasks: completedTasks.length,
      validScoreCount: scoreValues.length,
      validKpiCount: kpiValues.length,
      weightedAverageScore: scoreValues.length > 0 ? Number((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(2)) : null,
      averageKpi: kpiValues.length > 0 ? Number((kpiValues.reduce((a, b) => a + b, 0) / kpiValues.length).toFixed(2)) : null,
      totalScore: null,
      rating: PERFORMANCE_RATINGS.INSUFFICIENT_DATA,
    };
  }

  // Tính Điểm trung bình theo trọng số (S_tb)
  const sumScores = scoreValues.reduce((sum, val) => sum + val, 0);
  const weightedAverageScore = Number((sumScores / scoreValues.length).toFixed(2));

  // Tính KPI trung bình (KPI_tb)
  const sumKpi = kpiValues.reduce((sum, val) => sum + val, 0);
  const averageKpi = Number((sumKpi / kpiValues.length).toFixed(2));

  // Tính Tổng điểm (T) = S_tb * (KPI_tb / 100)
  const totalScore = Number((weightedAverageScore * (averageKpi / 100)).toFixed(2));

  // Xếp loại
  const rating = classifyPerformance(totalScore);

  return {
    hasEnoughData: true,
    totalTasks: completedTasks.length,
    validScoreCount: scoreValues.length,
    validKpiCount: kpiValues.length,
    weightedAverageScore,
    averageKpi,
    totalScore,
    rating,
  };
}
