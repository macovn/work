import { ComplexityLevel } from "@prisma/client";

/**
 * Bảng quy đổi chuẩn mức độ phức tạp sang hệ số quy đổi
 * N1 = 1.00
 * N2 = 1.25
 * N3 = 1.50
 * N4 = 2.00
 * N5 = 2.50
 */
export const COMPLEXITY_FACTOR_MAP: Record<ComplexityLevel, number> = {
  N1: 1.0,
  N2: 1.25,
  N3: 1.5,
  N4: 2.0,
  N5: 2.5,
};

/**
 * Lấy hệ số quy đổi tương ứng với mức độ phức tạp N1-N5
 */
export function getConversionFactorByComplexity(level: ComplexityLevel | string | null | undefined): number {
  if (!level) return 1.0;
  const key = String(level).toUpperCase() as ComplexityLevel;
  return COMPLEXITY_FACTOR_MAP[key] ?? 1.0;
}

export interface ScoreCalculationInput {
  benchmarkScore?: number | null;
  conversionFactor?: number | null;
  assignedVolume?: number | null;
  completedVolume?: number | null;
}

export interface ScoreCalculationResult {
  assignedScore: number | null;
  completedScore: number | null;
  completionRate: number | null;
}

/**
 * Tính toán điểm giao, điểm thực hiện và tỷ lệ hoàn thành
 * - Điểm giao = Khối lượng giao × Điểm chuẩn × Hệ số quy đổi
 * - Điểm thực hiện = Khối lượng hoàn thành × Điểm chuẩn × Hệ số quy đổi
 * - Tỷ lệ hoàn thành = Điểm thực hiện / Điểm giao × 100%
 */
export function calculateTaskScores(input: ScoreCalculationInput): ScoreCalculationResult {
  const { benchmarkScore, conversionFactor, assignedVolume, completedVolume } = input;

  const bScore = typeof benchmarkScore === "number" && !isNaN(benchmarkScore) ? benchmarkScore : null;
  const cFactor = typeof conversionFactor === "number" && !isNaN(conversionFactor) ? conversionFactor : null;
  const aVol = typeof assignedVolume === "number" && !isNaN(assignedVolume) ? assignedVolume : null;
  const cVol = typeof completedVolume === "number" && !isNaN(completedVolume) ? completedVolume : null;

  let assignedScore: number | null = null;
  let completedScore: number | null = null;
  let completionRate: number | null = null;

  if (bScore !== null && cFactor !== null && aVol !== null) {
    assignedScore = Number((aVol * bScore * cFactor).toFixed(2));
  }

  if (bScore !== null && cFactor !== null && cVol !== null) {
    completedScore = Number((cVol * bScore * cFactor).toFixed(2));
  }

  if (assignedScore !== null && assignedScore > 0 && completedScore !== null) {
    completionRate = Number(((completedScore / assignedScore) * 100).toFixed(2));
  } else if (assignedScore === 0 && completedScore === 0) {
    completionRate = 100;
  }

  return {
    assignedScore,
    completedScore,
    completionRate,
  };
}

/**
 * Dữ liệu Pilot 14 công việc chuẩn cho vị trí Dân số
 */
export const PILOT_DAN_SO_POSITION = {
  code: "VT-DAN-SO",
  name: "Dân số",
  description: "Vị trí việc làm chuyên trách công tác dân số và phát triển",
  groups: [
    {
      code: "GRP-DS-01",
      name: "Thu thập và quản trị dữ liệu dân số",
      weight: 25.0,
      tasks: [
        {
          code: "DS-01",
          name: "Thu thập thông tin, số liệu dân số",
          unit: "Phiếu/bộ dữ liệu",
          benchmarkScore: 4,
          complexityLevel: "N1" as ComplexityLevel,
          conversionFactor: 1.0,
        },
        {
          code: "DS-02",
          name: "Nhập/cập nhật dữ liệu dân số",
          unit: "Bộ dữ liệu",
          benchmarkScore: 5,
          complexityLevel: "N1" as ComplexityLevel,
          conversionFactor: 1.0,
        },
        {
          code: "DS-03",
          name: "Kiểm tra, làm sạch dữ liệu",
          unit: "Bộ dữ liệu",
          benchmarkScore: 8,
          complexityLevel: "N2" as ComplexityLevel,
          conversionFactor: 1.25,
        },
        {
          code: "DS-04",
          name: "Tổng hợp số liệu dân số",
          unit: "Báo cáo",
          benchmarkScore: 10,
          complexityLevel: "N2" as ComplexityLevel,
          conversionFactor: 1.25,
        },
      ],
    },
    {
      code: "GRP-DS-02",
      name: "Thống kê, phân tích và dự báo dân số",
      weight: 45.0,
      tasks: [
        {
          code: "DS-05",
          name: "Phân tích biến động dân số",
          unit: "Báo cáo",
          benchmarkScore: 20,
          complexityLevel: "N3" as ComplexityLevel,
          conversionFactor: 1.5,
        },
        {
          code: "DS-06",
          name: "Phân tích cơ cấu dân số",
          unit: "Báo cáo",
          benchmarkScore: 20,
          complexityLevel: "N3" as ComplexityLevel,
          conversionFactor: 1.5,
        },
        {
          code: "DS-07",
          name: "Phân tích chỉ tiêu mức sinh, tử, di cư",
          unit: "Chuyên đề",
          benchmarkScore: 20,
          complexityLevel: "N3" as ComplexityLevel,
          conversionFactor: 1.5,
        },
        {
          code: "DS-08",
          name: "Dự báo quy mô dân số",
          unit: "Báo cáo",
          benchmarkScore: 30,
          complexityLevel: "N4" as ComplexityLevel,
          conversionFactor: 2.0,
        },
        {
          code: "DS-12",
          name: "Điều tra/khảo sát dân số",
          unit: "Cuộc",
          benchmarkScore: 25,
          complexityLevel: "N3" as ComplexityLevel,
          conversionFactor: 1.5,
        },
        {
          code: "DS-13",
          name: "Báo cáo chuyên đề dân số",
          unit: "Báo cáo",
          benchmarkScore: 15,
          complexityLevel: "N3" as ComplexityLevel,
          conversionFactor: 1.5,
        },
      ],
    },
    {
      code: "GRP-DS-03",
      name: "Kế hoạch, chương trình và đề án dân số",
      weight: 30.0,
      tasks: [
        {
          code: "DS-09",
          name: "Xây dựng kế hoạch công tác dân số",
          unit: "Kế hoạch",
          benchmarkScore: 25,
          complexityLevel: "N3" as ComplexityLevel,
          conversionFactor: 1.5,
        },
        {
          code: "DS-10",
          name: "Xây dựng chương trình dân số",
          unit: "Chương trình",
          benchmarkScore: 35,
          complexityLevel: "N4" as ComplexityLevel,
          conversionFactor: 2.0,
        },
        {
          code: "DS-11",
          name: "Đánh giá kết quả chương trình dân số",
          unit: "Báo cáo",
          benchmarkScore: 25,
          complexityLevel: "N4" as ComplexityLevel,
          conversionFactor: 2.0,
        },
        {
          code: "DS-14",
          name: "Đề án/dự án dân số",
          unit: "Đề án",
          benchmarkScore: 40,
          complexityLevel: "N5" as ComplexityLevel,
          conversionFactor: 2.5,
        },
      ],
    },
  ],
};
