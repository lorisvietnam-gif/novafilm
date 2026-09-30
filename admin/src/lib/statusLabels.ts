import { getActiveLocale } from '@/i18n/detect'
import { messages } from '@/i18n/messages'

/**
 * Nhãn trạng thái cho bảng quản trị.
 *
 * Khoá của mọi bảng ở đây là **giá trị so sánh với dữ liệu backend** (`DRAFT`,
 * `pending`, `alipay`…). Chúng nằm trong cây pack `i18n/locales` chứ không nằm
 * trong file này, nên một mã mới phải có mặt ở cả ba ngôn ngữ thì mới biên dịch
 * được — không thể lỡ tay dịch luôn khoá.
 *
 * Tra không trúng thì trả về chính mã, đúng như trước: một trạng thái lạ từ
 * backend vẫn phải hiện ra để người vận hành nhìn thấy.
 */
function labelFrom(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

// Nhãn trạng thái dự án
export function projectStatusLabel(status: string): string {
  return labelFrom(messages[getActiveLocale()].labels.projectStatus, status);
}

// Nhãn trạng thái thanh toán của đơn
export function orderStatusLabel(status: string): string {
  return labelFrom(messages[getActiveLocale()].labels.orderStatus, status);
}

// Nhãn kết quả kiểm duyệt / hiển thị
export function auditStatusLabel(status: string): string {
  return labelFrom(messages[getActiveLocale()].labels.auditStatus, status);
}

// Nhãn mức hiển thị công khai
export function visibilityLabel(status: string): string {
  return labelFrom(messages[getActiveLocale()].labels.visibility, status);
}

// Nhãn loại bút toán ví
export function ledgerKindLabel(kind: string): string {
  return labelFrom(messages[getActiveLocale()].labels.ledgerKind, kind);
}

// Nhãn kênh thanh toán
export function payTypeLabel(payType: string): string {
  return labelFrom(messages[getActiveLocale()].labels.payType, payType);
}

// Nhãn trạng thái tác vụ
export function taskStatusLabel(status: string): string {
  return labelFrom(messages[getActiveLocale()].labels.taskStatus, status);
}

// Nhãn lĩnh vực tác vụ
export function taskDomainLabel(domain: string): string {
  return labelFrom(messages[getActiveLocale()].labels.taskDomain, domain);
}

// Nhãn loại tác vụ
export function taskTypeLabel(taskType: string): string {
  return labelFrom(messages[getActiveLocale()].labels.taskType, taskType);
}

// Nhãn trạng thái từng cảnh
export function shotStatusLabel(status: string): string {
  return labelFrom(messages[getActiveLocale()].labels.shotStatus, status);
}

// Nhãn năng lực tính phí (mã như usage_by_capability)
export function capabilityLabel(key: string): string {
  return labelFrom(messages[getActiveLocale()].labels.capability, key);
}

// Nhãn căn cứ tính phí; `basis` rỗng thì suy ra từ cờ `estimated`
export function billingBasisLabel(basis: string | null | undefined, estimated?: boolean): string {
  if (basis) return labelFrom(messages[getActiveLocale()].labels.billingBasis, basis);
  return estimated
    ? messages[getActiveLocale()].labels.billingBasis.estimate
    : messages[getActiveLocale()].labels.billingBasis.upstream;
}

/** Lựa chọn trong ô lọc trạng thái dự án (giá trị giữ nguyên tiếng Anh cho API) */
export function projectStatusOptions(): { value: string; label: string }[] {
  const m = messages[getActiveLocale()];
  return [
    { value: "", label: m.labels.filter.allStatus },
    ...Object.entries(m.labels.projectStatus).map(([value, label]) => ({ value, label })),
  ];
}
