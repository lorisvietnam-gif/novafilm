import { getActiveLocale } from "@/i18n/detect";
import { messages } from "@/i18n/messages";

/** 漫剧资产生成状态（与 params.generation.status 一致） */
export const DRAMA_GENERATION_STATUSES = [
  "queued",
  "running",
  "generating",
  "done",
  "failed",
  "cancelled",
] as const;

/**
 * 漫剧生成状态标签（idle 仅用于分镜等无 params.generation 时的展示回退）。
 *
 * Mã trạng thái nằm trong cây pack dưới `labels.dramaGeneration` nên một mã mới
 * phải có mặt ở cả ba ngôn ngữ thì mới biên dịch được. Tra trượt thì trả về
 * chính mã, đúng như trước: trạng thái lạ từ backend vẫn phải hiện ra.
 */
export function dramaGenerationStatusLabel(status: string): string {
  const m = messages[getActiveLocale()];
  return m.labels.dramaGeneration[status as keyof typeof m.labels.dramaGeneration] ?? status;
}

/** 列表/详情展示：空值显示 — */
export function formatDramaGenerationStatus(status: string | null | undefined): string {
  if (!status) return "—";
  return dramaGenerationStatusLabel(status);
}

/** 漫剧资产类型标签 */
export function dramaAssetTypeLabel(type: string): string {
  const m = messages[getActiveLocale()];
  return m.labels.dramaAssetType[type as keyof typeof m.labels.dramaAssetType] ?? type;
}
