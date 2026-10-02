/**
 * Nhãn cho thông báo lỗi mà backend trả về bằng tiếng Trung.
 *
 * Backend ném `ValueError("请先生成分集剧本")` và FastAPI đưa nguyên văn chuỗi đó vào
 * `detail`, nên frontend in ra đúng tiếng Trung. Ở đây giữ nguyên **giá trị** và
 * chỉ tra một nhãn hiển thị tương ứng.
 *
 * VÌ SAO KHÔNG DỊCH THẲNG Ở BACKEND — đây là ràng buộc kỹ thuật, không phải sở thích:
 * chuỗi tiếng Trung trong `detail` là **đầu vào của phân loại lỗi**, không chỉ là văn
 * bản. `billingError.isBillingError()` dò `余额不足` / `请先充值`, `dramaGenError.ts`
 * dò `生图失败` / `上一镜失败` / `分镜已变更`, `apiError.parseRawApiError()` dò
 * `不存在` / `超时` / `网络`. Dịch giá trị gốc là những regex đó trượt, và mọi nhánh
 * xử lý rơi xuống fallback cuối — tức thông báo lỗi biến mất im lặng. Nên phải giữ
 * chuỗi gốc làm **khoá** và dịch ở tầng hiển thị.
 *
 * Đã đo trước khi viết (2026-10-02, `.kilo/err_scan2.py`): backend có **118** chuỗi
 * `detail=` tiếng Trung phân tĩnh. Bảng dưới đây phủ hết các chuỗi đó.
 *
 * `localizeBackendMessage()` trả về **nguyên văn** khi không có trong bảng — thông báo lạ
 * phải hiện được chứ không được nuốt, nên thiếu mục là hành vi chấp nhận được.
 */

import { localized, type LocalizedText } from './localeStrings'

/** Khoá là đúng chuỗi backend trả về, khớp từng ký tự. */
const BACKEND_MESSAGES: Record<string, LocalizedText> = {
  // ---- api/admin/drama_*.py, api/admin/projects.py ------------------------------
  '漫剧资产不存在': {
    zh: '漫剧资产不存在',
    en: 'That drama asset does not exist',
    vi: 'Tài nguyên của dự án AI Drama không tồn tại',
  },
  '漫剧分集不存在': {
    zh: '漫剧分集不存在',
    en: 'That drama episode does not exist',
    vi: 'Tập của dự án AI Drama không tồn tại',
  },
  '漫剧分镜不存在': {
    zh: '漫剧分镜不存在',
    en: 'That storyboard shot does not exist',
    vi: 'Cảnh storyboard của dự án AI Drama không tồn tại',
  },
  '漫剧项目不存在': {
    zh: '漫剧项目不存在',
    en: 'That drama project does not exist',
    vi: 'Dự án AI Drama không tồn tại',
  },
  '项目不存在': {
    zh: '项目不存在',
    en: 'That project does not exist',
    vi: 'Dự án không tồn tại',
  },

  // ---- api/admin/settings.py, templates.py, users.py, works.py ------------------
  '未配置 TokenFree API Key（请先在「模型」填写）': {
    zh: '未配置 TokenFree API Key（请先在「模型」填写）',
    en: 'No TokenFree API key is set (fill it in under Models first)',
    vi: 'Chưa cấu hình khoá API TokenFree (hãy điền ở mục «Mô hình» trước)',
  },
  'TokenFree 额度查询失败': {
    zh: 'TokenFree 额度查询失败',
    en: 'Could not read the TokenFree credit balance',
    vi: 'Không kiểm tra được hạn mức TokenFree',
  },
  '模板不存在': {
    zh: '模板不存在',
    en: 'That template does not exist',
    vi: 'Mẫu không tồn tại',
  },
  '模板 ID 已存在': {
    zh: '模板 ID 已存在',
    en: 'That template ID is already taken',
    vi: 'ID mẫu này đã tồn tại',
  },
  '用户不存在': {
    zh: '用户不存在',
    en: 'That user does not exist',
    vi: 'Người dùng không tồn tại',
  },
  'role 仅支持 user 或 admin': {
    zh: 'role 仅支持 user 或 admin',
    en: 'role only accepts user or admin',
    vi: 'role chỉ nhận giá trị user hoặc admin',
  },
  '不能降低自己的管理员权限': {
    zh: '不能降低自己的管理员权限',
    en: 'You cannot lower your own admin rights',
    vi: 'Bạn không thể tự hạ quyền quản trị của chính mình',
  },
  '余额不能为负': {
    zh: '余额不能为负',
    en: 'The balance cannot be negative',
    vi: 'Số dư không được âm',
  },
  '作品不存在': {
    zh: '作品不存在',
    en: 'That work does not exist',
    vi: 'Tác phẩm không tồn tại',
  },
  'visibility 无效': {
    zh: 'visibility 无效',
    en: 'visibility is not valid',
    vi: 'visibility không hợp lệ',
  },
  'audit_status 无效': {
    zh: 'audit_status 无效',
    en: 'audit_status is not valid',
    vi: 'audit_status không hợp lệ',
  },

  // ---- api/api_keys.py, api/auth.py, api/oauth.py -------------------------------
  'Key 不存在或已撤销': {
    zh: 'Key 不存在或已撤销',
    en: 'That key does not exist or has been revoked',
    vi: 'Khoá không tồn tại hoặc đã bị thu hồi',
  },
  '邮箱已注册': {
    zh: '邮箱已注册',
    en: 'That email is already registered',
    vi: 'Email này đã được đăng ký',
  },
  '当前密码不正确': {
    zh: '当前密码不正确',
    en: 'The current password is incorrect',
    vi: 'Mật khẩu hiện tại không đúng',
  },
  '新密码不能与当前密码相同': {
    zh: '新密码不能与当前密码相同',
    en: 'The new password must differ from the current one',
    vi: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
  },
  '该邮箱已被使用': {
    zh: '该邮箱已被使用',
    en: 'That email is already in use',
    vi: 'Email này đã có người dùng',
  },
  '仅支持 JPG / PNG / WebP / GIF': {
    zh: '仅支持 JPG / PNG / WebP / GIF',
    en: 'Only JPG / PNG / WebP / GIF are supported',
    vi: 'Chỉ hỗ trợ JPG / PNG / WebP / GIF',
  },
  '空文件': {
    zh: '空文件',
    en: 'The file is empty',
    vi: 'Tệp rỗng',
  },
  '头像不能超过 5MB': {
    zh: '头像不能超过 5MB',
    en: 'The avatar cannot exceed 5MB',
    vi: 'Ảnh đại diện không được vượt quá 5MB',
  },
  '账号不存在或已完成设置': {
    zh: '账号不存在或已完成设置',
    en: 'That account does not exist, or it is already set up',
    vi: 'Tài khoản không tồn tại hoặc đã thiết lập xong',
  },

  // ---- api/billing.py ------------------------------------------------------------
  '未知充值包': {
    zh: '未知充值包',
    en: 'Unknown top-up package',
    vi: 'Gói nạp không xác định',
  },
  '告警不存在': {
    zh: '告警不存在',
    en: 'That alert does not exist',
    vi: 'Cảnh báo không tồn tại',
  },
  '订单不存在': {
    zh: '订单不存在',
    en: 'That order does not exist',
    vi: 'Đơn hàng không tồn tại',
  },
  '已支付订单无法关闭': {
    zh: '已支付订单无法关闭',
    en: 'A paid order cannot be closed',
    vi: 'Không thể đóng đơn hàng đã thanh toán',
  },
  '当前状态不可关闭': {
    zh: '当前状态不可关闭',
    en: 'It cannot be closed in its current state',
    vi: 'Không thể đóng ở trạng thái hiện tại',
  },

  // ---- api/drama/agents.py -------------------------------------------------------
  '请先生成剧本摘要': {
    zh: '请先生成剧本摘要',
    en: 'Generate the script summary first',
    vi: 'Hãy tạo tóm tắt kịch bản trước',
  },
  '缺少剧本': {
    zh: '缺少剧本',
    en: 'The script is missing',
    vi: 'Thiếu kịch bản',
  },
  '创意文案至少 20 字': {
    zh: '创意文案至少 20 字',
    en: 'The creative brief needs at least 20 characters',
    vi: 'Văn bản ý tưởng cần ít nhất 20 ký tự',
  },
  'generate_mode 须为 optimize/summary/body/full/brief': {
    zh: 'generate_mode 须为 optimize/summary/body/full/brief',
    en: 'generate_mode must be optimize, summary, body, full or brief',
    vi: 'generate_mode phải là optimize, summary, body, full hoặc brief',
  },
  '全集剧本正在生成，请稍后再优化单集': {
    zh: '全集剧本正在生成，请稍后再优化单集',
    en: 'The full script is still generating; optimise an episode afterwards',
    vi: 'Kịch bản toàn bộ đang được tạo, hãy tối ưu tập sau',
  },
  '请先输入本集剧本草稿，再让 AI 优化': {
    zh: '请先输入本集剧本草稿，再让 AI 优化',
    en: 'Enter a draft for this episode before asking AI to optimise it',
    vi: 'Hãy nhập bản nháp kịch bản của tập này trước khi để AI tối ưu',
  },
  '剧本草稿至少 20 字': {
    zh: '剧本草稿至少 20 字',
    en: 'The script draft needs at least 20 characters',
    vi: 'Bản nháp kịch bản cần ít nhất 20 ký tự',
  },
  '请先填写本集原始创意（至少 20 字）': {
    zh: '请先填写本集原始创意（至少 20 字）',
    en: 'Fill in the original idea for this episode first (at least 20 characters)',
    vi: 'Hãy điền ý tưởng gốc của tập này trước (ít nhất 20 ký tự)',
  },
  '请先填写本集创意或摘要': {
    zh: '请先填写本集创意或摘要',
    en: 'Fill in the idea or summary for this episode first',
    vi: 'Hãy điền ý tưởng hoặc tóm tắt của tập này trước',
  },
  '请先有本集剧本内容，再补齐创意与摘要': {
    zh: '请先有本集剧本内容，再补齐创意与摘要',
    en: 'This episode needs script content before the idea and summary can be filled in',
    vi: 'Tập này cần có nội dung kịch bản trước khi bổ sung ý tưởng và tóm tắt',
  },
  '全集剧本正在生成，请完成后再加集': {
    zh: '全集剧本正在生成，请完成后再加集',
    en: 'The full script is still generating; add episodes once it finishes',
    vi: 'Kịch bản toàn bộ đang được tạo, hãy thêm tập sau khi xong',
  },

  // ---- api/drama/assets.py, generation.py, episodes.py, projects.py, scripts.py ---
  '资产不存在': {
    zh: '资产不存在',
    en: 'That asset does not exist',
    vi: 'Tài nguyên không tồn tại',
  },
  '形象生成中，请稍后再更换图片': {
    zh: '形象生成中，请稍后再更换图片',
    en: 'The look is still being generated; change the image later',
    vi: 'Hình ảnh nhân vật đang được tạo, hãy đổi ảnh sau',
  },
  '文件不能超过 20MB': {
    zh: '文件不能超过 20MB',
    en: 'The file cannot exceed 20MB',
    vi: 'Tệp không được vượt quá 20MB',
  },
  '形象生成中，无法切换历史版本': {
    zh: '形象生成中，无法切换历史版本',
    en: 'The look is still being generated, so history versions cannot be switched',
    vi: 'Hình ảnh nhân vật đang được tạo, chưa thể chuyển phiên bản lịch sử',
  },
  '资产抽取进行中，请稍后再确认': {
    zh: '资产抽取进行中，请稍后再确认',
    en: 'Asset extraction is running; confirm again a little later',
    vi: 'Đang trích xuất tài nguyên, hãy xác nhận lại sau ít phút',
  },
  '本集含已生成视频或手改分镜，请确认后强制重新分镜': {
    zh: '本集含已生成视频或手改分镜，请确认后强制重新分镜',
    en: 'This episode already has a generated video or hand-edited shots; confirm before forcing a re-plan',
    vi: 'Tập này đã có video đã tạo hoặc cảnh đã sửa tay, hãy xác nhận trước khi ép tạo lại storyboard',
  },
  '分镜不存在': {
    zh: '分镜不存在',
    en: 'That storyboard shot does not exist',
    vi: 'Cảnh storyboard không tồn tại',
  },
  '分镜正在生成，请完成后再切换版本': {
    zh: '分镜正在生成，请完成后再切换版本',
    en: 'A shot is still generating; switch versions once it finishes',
    vi: 'Một cảnh đang được tạo, hãy đổi phiên bản sau khi xong',
  },
  '没有可生成的分镜（保存后分镜已更新，请再点一次生成）': {
    zh: '没有可生成的分镜（保存后分镜已更新，请再点一次生成）',
    en: 'There is no shot to generate (the storyboard changed after saving, so press generate again)',
    vi: 'Không có cảnh nào để tạo (storyboard đã cập nhật sau khi lưu, hãy bấm tạo lại)',
  },
  '所选分镜正在生成，请等待完成后再试': {
    zh: '所选分镜正在生成，请等待完成后再试',
    en: 'The selected shot is still generating; wait for it to finish and try again',
    vi: 'Cảnh đã chọn đang được tạo, hãy đợi xong rồi thử lại',
  },
  '已开启尾帧衔接：请先生成上一镜并等待尾帧就绪后，再点本镜生成': {
    zh: '已开启尾帧衔接：请先生成上一镜并等待尾帧就绪后，再点本镜生成',
    en: 'Last-frame continuity is on: generate the previous shot and wait for its last frame first',
    vi: 'Đã bật nối khung cuối: hãy tạo cảnh trước và đợi khung cuối sẵn sàng rồi tạo cảnh này',
  },
  '分集不存在': {
    zh: '分集不存在',
    en: 'That episode does not exist',
    vi: 'Tập không tồn tại',
  },
  '缺少 prompt': {
    zh: '缺少 prompt',
    en: 'The prompt is missing',
    vi: 'Thiếu prompt',
  },
  '仅支持角色资产': {
    zh: '仅支持角色资产',
    en: 'Only character assets are supported',
    vi: 'Chỉ hỗ trợ tài nguyên nhân vật',
  },
  '缺少 voice_prompt': {
    zh: '缺少 voice_prompt',
    en: 'The voice_prompt is missing',
    vi: 'Thiếu voice_prompt',
  },
  '角色资产不存在': {
    zh: '角色资产不存在',
    en: 'That character asset does not exist',
    vi: 'Tài nguyên nhân vật không tồn tại',
  },
  'character_asset_id 须为角色资产': {
    zh: 'character_asset_id 须为角色资产',
    en: 'character_asset_id must be a character asset',
    vi: 'character_asset_id phải là tài nguyên nhân vật',
  },
  '原始创意至少需要 20 个字': {
    zh: '原始创意至少需要 20 个字',
    en: 'The original idea needs at least 20 characters',
    vi: 'Ý tưởng gốc cần ít nhất 20 ký tự',
  },
  '剧本不存在': {
    zh: '剧本不存在',
    en: 'That script does not exist',
    vi: 'Kịch bản không tồn tại',
  },

  // ---- api/drama/skills.py -------------------------------------------------------
  'Skill 不存在': {
    zh: 'Skill 不存在',
    en: 'That skill does not exist',
    vi: 'Skill không tồn tại',
  },
  '请上传 .md 文件': {
    zh: '请上传 .md 文件',
    en: 'Upload a .md file',
    vi: 'Hãy tải lên tệp .md',
  },
  '文件不能超过 200KB': {
    zh: '文件不能超过 200KB',
    en: 'The file cannot exceed 200KB',
    vi: 'Tệp không được vượt quá 200KB',
  },
  '文件须为 UTF-8 文本': {
    zh: '文件须为 UTF-8 文本',
    en: 'The file must be UTF-8 text',
    vi: 'Tệp phải là văn bản UTF-8',
  },
  '不能修改他人 Skill': {
    zh: '不能修改他人 Skill',
    en: "You cannot modify someone else's skill",
    vi: 'Bạn không thể sửa Skill của người khác',
  },
  '系统内置 Skill 不能删除，可停用': {
    zh: '系统内置 Skill 不能删除，可停用',
    en: 'Built-in skills cannot be deleted, only disabled',
    vi: 'Skill tích hợp sẵn không thể xoá, chỉ có thể tắt',
  },
  '不能删除他人 Skill': {
    zh: '不能删除他人 Skill',
    en: "You cannot delete someone else's skill",
    vi: 'Bạn không thể xoá Skill của người khác',
  },

  // ---- api/projects.py ----------------------------------------------------------
  '请输入选题': {
    zh: '请输入选题',
    en: 'Enter a topic first',
    vi: 'Hãy nhập chủ đề',
  },
  '整片生成进行中，请稍后': {
    zh: '整片生成进行中，请稍后',
    en: 'The full film is still rendering; try again shortly',
    vi: 'Toàn phim đang được tạo, hãy thử lại sau ít phút',
  },
  '生成进行中，请稍后': {
    zh: '生成进行中，请稍后',
    en: 'Generation is already running; try again shortly',
    vi: 'Đang tạo, hãy thử lại sau ít phút',
  },
  '无效模板': {
    zh: '无效模板',
    en: 'Invalid template',
    vi: 'Mẫu không hợp lệ',
  },
  '请选择要下载的作品': {
    zh: '请选择要下载的作品',
    en: 'Select a work to download',
    vi: 'Hãy chọn tác phẩm cần tải',
  },
  '一次最多打包 50 个': {
    zh: '一次最多打包 50 个',
    en: 'At most 50 items can be packaged at once',
    vi: 'Mỗi lần chỉ đóng gói được tối đa 50 mục',
  },
  '所选作品暂无成片可下载（需状态为已完成）': {
    zh: '所选作品暂无成片可下载（需状态为已完成）',
    vi: 'Các tác phẩm đã chọn chưa có phim hoàn chỉnh để tải (cần trạng thái đã hoàn thành)',
    en: 'The selected works have no finished film to download yet (status must be completed)',
  },
  '生成进行中，无法修改': {
    zh: '生成进行中，无法修改',
    en: 'Generation is running, so it cannot be changed',
    vi: 'Đang tạo, không thể sửa',
  },
  '无效封面地址': {
    zh: '无效封面地址',
    en: 'Invalid cover URL',
    vi: 'Địa chỉ ảnh bìa không hợp lệ',
  },
  '无效图片模型': {
    zh: '无效图片模型',
    en: 'Invalid image model',
    vi: 'Mô hình ảnh không hợp lệ',
  },
  '无效视频模型': {
    zh: '无效视频模型',
    en: 'Invalid video model',
    vi: 'Mô hình video không hợp lệ',
  },
  '生成进行中，无法更换封面': {
    zh: '生成进行中，无法更换封面',
    en: 'Generation is running, so the cover cannot be changed',
    vi: 'Đang tạo, không thể đổi ảnh bìa',
  },
  '封面不能超过 8MB': {
    zh: '封面不能超过 8MB',
    en: 'The cover cannot exceed 8MB',
    vi: 'Ảnh bìa không được vượt quá 8MB',
  },
  '素材已齐，请点击合成成片': {
    zh: '素材已齐，请点击合成成片',
    en: 'Everything is ready; press compose to render the film',
    vi: 'Đủ tư liệu rồi, hãy bấm tổng hợp để dựng phim',
  },
  '当前状态不可取消': {
    zh: '当前状态不可取消',
    en: 'It cannot be cancelled in its current state',
    vi: 'Không thể huỷ ở trạng thái hiện tại',
  },
  '镜头列表不完整': {
    zh: '镜头列表不完整',
    en: 'The shot list is incomplete',
    vi: 'Danh sách cảnh chưa đầy đủ',
  },
  '画面不能超过 8MB': {
    zh: '画面不能超过 8MB',
    en: 'The image cannot exceed 8MB',
    vi: 'Ảnh không được vượt quá 8MB',
  },
  '文件不是有效图片': {
    zh: '文件不是有效图片',
    en: 'The file is not a valid image',
    vi: 'Tệp không phải ảnh hợp lệ',
  },
  '图文模式无需生成 AI 视频，请直接重新合成成片': {
    zh: '图文模式无需生成 AI 视频，请直接重新合成成片',
    en: 'Image-and-text mode does not need an AI video; just compose again',
    vi: 'Chế độ ảnh chữ không cần tạo video AI, hãy tổng hợp lại thẳng',
  },
  '请先生成该镜画面': {
    zh: '请先生成该镜画面',
    en: 'Generate the image for this shot first',
    vi: 'Hãy tạo ảnh cho cảnh này trước',
  },
  '暂无分镜，请先生成': {
    zh: '暂无分镜，请先生成',
    en: 'There are no shots yet; generate them first',
    vi: 'Chưa có cảnh nào, hãy tạo trước',
  },
  '缺少分镜图或镜头视频，无法合成': {
    zh: '缺少分镜图或镜头视频，无法合成',
    en: 'A shot image or clip is missing, so it cannot be composed',
    vi: 'Thiếu ảnh cảnh hoặc video cảnh, không thể tổng hợp',
  },
  '成片未完成，无法发布': {
    zh: '成片未完成，无法发布',
    en: 'The film is not finished, so it cannot be published',
    vi: 'Phim chưa hoàn thành, không thể xuất bản',
  },

  // ---- api/tasks.py, api/templates.py, api/tools.py, api/v1/generation.py ------
  '任务不存在': {
    zh: '任务不存在',
    en: 'That task does not exist',
    vi: 'Tác vụ không tồn tại',
  },
  '模拟延时任务最多同时运行 3 个': {
    zh: '模拟延时任务最多同时运行 3 个',
    en: 'At most 3 mock delay tasks can run at once',
    vi: 'Tối đa 3 tác vụ giả lập chạy cùng lúc',
  },
  '缺少任务': {
    zh: '缺少任务',
    en: 'The task is missing',
    vi: 'Thiếu tác vụ',
  },
  '记录不存在': {
    zh: '记录不存在',
    en: 'That record does not exist',
    vi: 'Bản ghi không tồn tại',
  },
  'content 不能为空': {
    zh: 'content 不能为空',
    en: 'content must not be empty',
    vi: 'content không được rỗng',
  },
  '缺少 task_id': {
    zh: '缺少 task_id',
    en: 'The task_id is missing',
    vi: 'Thiếu task_id',
  },

  // ---- lỗi ghi vào database (error_message=) chứ không đi qua HTTPException -------
  '余额不足': {
    zh: '余额不足',
    en: 'Not enough balance',
    vi: 'Số dư không đủ',
  },
  '缺少上游任务 ID，无法轮询': {
    zh: '缺少上游任务 ID，无法轮询',
    en: 'The upstream task ID is missing, so it cannot be polled',
    vi: 'Thiếu ID tác vụ thượng nguồn, không thể theo dõi',
  },
  '视频轮询超时，预扣已退回': {
    zh: '视频轮询超时，预扣已退回',
    en: 'Video polling timed out; the pre-authorised hold was returned',
    vi: 'Theo dõi video quá thời gian chờ, khoản giữ trước đã được hoàn lại',
  },
  '集号无效': {
    zh: '集号无效',
    en: 'That episode number is not valid',
    vi: 'Số tập không hợp lệ',
  },
  '分集写入后未能重新加载': {
    zh: '分集写入后未能重新加载',
    en: 'The episodes were written but could not be reloaded',
    vi: 'Đã ghi tập nhưng không tải lại được',
  },
  '未解析到可用文字模型。请在管理后台填写 TokenFree API Key，拉取并选择文本模型。': {
    zh: '未解析到可用文字模型。请在管理后台填写 TokenFree API Key，拉取并选择文本模型。',
    en: 'No usable text model is configured. Add a TokenFree API key in the admin console, then fetch and pick a text model.',
    vi: 'Chưa có mô hình văn bản nào dùng được. Hãy điền khoá API TokenFree trong trang quản trị, rồi tải về và chọn một mô hình văn bản.',
  },
}

/**
 * Thông báo có phần biến ở cuối nên không thể liệt kê từng giá trị: số tập, số dự án,
 * danh sách id, hay `{exc}` từ thư viện. Với những thông báo này bảng khoá theo **mẫu**,
 * và `{0}` là nhóm bắt được đầu tiên.
 *
 * Thứ tự thử: khoá chính xác trước, rồi mới tới mẫu. `项目不存在` vừa là khoá chính
 * xác vừa là tiền tố của `项目不存在: [...]` — tra chính xác trước là bắt buộc, nếu
 * không thì thông báo ngắn sẽ bị mẫu nuốt mất.
 */
const BACKEND_MESSAGE_PATTERNS: Array<{ pattern: RegExp; text: LocalizedText }> = [
  {
    pattern: /^模板仍被\s*(\d+)\s*个项目引用，无法删除$/,
    text: {
      zh: '模板仍被 {0} 个项目引用，无法删除',
      en: '{0} projects still reference this template, so it cannot be deleted',
      vi: 'Vẫn còn {0} dự án tham chiếu mẫu này nên không thể xoá',
    },
  },
  {
    pattern: /^最多\s*(\d+)\s*集$/,
    text: {
      zh: '最多 {0} 集',
      en: 'At most {0} episodes',
      vi: 'Tối đa {0} tập',
    },
  },
  {
    pattern: /^无法读取上传文件：([\s\S]*)$/,
    text: {
      zh: '无法读取上传文件：{0}',
      en: 'Cannot read the uploaded file: {0}',
      vi: 'Không đọc được tệp tải lên: {0}',
    },
  },
  {
    pattern: /^OSS 上传失败：([\s\S]*)$/,
    text: {
      zh: 'OSS 上传失败：{0}',
      en: 'OSS upload failed: {0}',
      vi: 'Tải lên OSS thất bại: {0}',
    },
  },
  {
    pattern: /^保存图片失败：([\s\S]*)$/,
    text: {
      zh: '保存图片失败：{0}',
      en: 'Could not save the image: {0}',
      vi: 'Lưu ảnh thất bại: {0}',
    },
  },
  {
    pattern: /^全片合成失败：([\s\S]*)$/,
    text: {
      zh: '全片合成失败：{0}',
      en: 'Composing the full film failed: {0}',
      vi: 'Tổng hợp toàn phim thất bại: {0}',
    },
  },
  {
    pattern: /^试听生成失败：([\s\S]*)$/,
    text: {
      zh: '试听生成失败：{0}',
      en: 'The preview clip failed to generate: {0}',
      vi: 'Tạo đoạn thử thất bại: {0}',
    },
  },
  {
    pattern: /^AI 生成失败：([\s\S]*)$/,
    text: {
      zh: 'AI 生成失败：{0}',
      en: 'AI generation failed: {0}',
      vi: 'Tạo bằng AI thất bại: {0}',
    },
  },
  {
    pattern: /^项目不存在:?\s*([\s\S]+)$/,
    text: {
      zh: '项目不存在: {0}',
      en: 'These projects do not exist: {0}',
      vi: 'Không tồn tại dự án: {0}',
    },
  },
  {
    pattern: /^未注册任务处理器:?\s*([\s\S]+)$/,
    text: {
      zh: '未注册任务处理器：{0}',
      en: 'No handler is registered for task {0}',
      vi: 'Chưa đăng ký bộ xử lý cho tác vụ {0}',
    },
  },
]

/**
 * Thông báo backend đã qua bảng nhãn; chuỗi lạ thì trả về nguyên văn.
 *
 * Chỉ `message` hiển thị mới đi qua đây. **Phân loại lỗi thì không** — xem ghi chú ở
 * đầu file: `isBillingError()` và `parseRawApiError()` phải dò trên chuỗi thô.
 */
export function localizeBackendMessage(message: string): string {
  const text = message.trim()
  const entry = BACKEND_MESSAGES[text]
  if (entry) return localized(entry)
  for (const { pattern, text: label } of BACKEND_MESSAGE_PATTERNS) {
    const m = pattern.exec(text)
    if (!m) continue
    // `{0}` chỉ xuất hiện trong `zh` / `en` / `vi` cùng lúc; thay cả ba vế để câu
    // dịch không lẫn ký tự thay thế vào giữa tiếng Việt.
    return localized(label).replace('{0}', m[1] ?? '')
  }
  return message
}