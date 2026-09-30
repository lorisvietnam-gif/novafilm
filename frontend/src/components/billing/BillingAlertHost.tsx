import { useCallback, useEffect, useRef } from 'react'
import { api } from '../../api'
import { dialog } from '../../lib/dialog'
import { localized, type LocalizedText } from '../../lib/localeStrings'

type BillingAlertItem = {
  id: number
  kind: string
  title: string
  message: string
  milestone_fen: number
  milestone_yuan: number
  created_at?: string | null
}

// Tiêu đề và nút dự phòng khi backend không gửi kèm; tiếng Trung chỉ để phục vụ locale zh.
const FALLBACK_TITLE: LocalizedText = {
  zh: '消费提醒',
  en: 'Spending reminder',
  vi: 'Nhắc mức tiêu thụ',
}
const CONFIRM_LABEL: LocalizedText = {
  zh: '知道了',
  en: 'Got it',
  vi: 'Đã hiểu',
}

/** Poll các cảnh báo hạn mức chờ hiển thị rồi bật popup. */
export default function BillingAlertHost() {
  // Khoá trước khi gửi request pending, để focus/interval/StrictMode không chạy chồng
  const showingRef = useRef(false)

  const checkAlerts = useCallback(async () => {
    if (!localStorage.getItem('token') || showingRef.current) return
    showingRef.current = true
    try {
      const res = await api.billingAlertsPending()
      const items = (res.items ?? []) as BillingAlertItem[]
      if (!items.length) return
      for (const item of items) {
        await dialog.alert({
          title: item.title || localized(FALLBACK_TITLE),
          message: item.message,
          confirmText: localized(CONFIRM_LABEL),
        })
        try {
          await api.billingAlertAck(item.id)
        } catch {
          // Đã xác nhận, hoặc 404 do hai lần ack chạy song song — bỏ qua để khỏi lặp vô hạn
        }
      }
    } catch {
      // Chưa đăng nhập hoặc lỗi mạng thì bỏ qua im lặng
    } finally {
      showingRef.current = false
    }
  }, [])

  useEffect(() => {
    void checkAlerts()
    const timer = window.setInterval(() => void checkAlerts(), 30_000)
    const onFocus = () => void checkAlerts()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [checkAlerts])

  return null
}
