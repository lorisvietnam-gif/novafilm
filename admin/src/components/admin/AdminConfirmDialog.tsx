import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminModal } from "@/components/admin/AdminModal";
import { useI18n } from "@/i18n";

type AdminConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

// 管理端确认弹窗（删除等二次确认）
export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading = false,
  destructive = false,
  onOpenChange,
  onConfirm,
}: AdminConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <AdminModal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={title}
      subtitle={description}
      footer={
        <>
          <Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            {cancelLabel ?? t("common.action.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel ?? t("common.action.confirm")}
          </Button>
        </>
      }
    />
  );
}
