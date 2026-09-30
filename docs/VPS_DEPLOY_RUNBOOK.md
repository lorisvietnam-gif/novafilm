# VPS_DEPLOY_RUNBOOK — NOVAFILM staging

Trình tự đúng thứ tự, mỗi bước đều có cách kiểm chứng. Chạy trên VPS Linux.

**Kiến trúc đã chốt:** Frontend = Firebase Hosting (static) · Backend = VPS + Docker Compose.
Hai origin khác nhau, nên `CORS_ORIGINS` của API phải khai origin của frontend.

> **Không hard-code domain vào source.** Mọi tham chiếu đến từ `deploy/.env.prod`
> hoặc `backend/.env`. Đổi staging → production **không chỉ là đổi biến**, xem mục 8.

---

## 1. Chuẩn bị máy chủ

```bash
# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker
docker compose version

# Công cụ mà ứng dụng cần: FFmpeg và font có dấu
sudo apt-get update && sudo apt-get install -y ffmpeg fonts-wqy-zenhei fontconfig
fc-list | grep -i wqy | head        # phải có dấu tiếng Việt, không có thì phụ đề vỡ dấu
```

Mở cổng **22** và **80/443**. Postgres và Redis không cần mở cổng nào ra ngoài —
compose đã gán chúng vào `127.0.0.1`.

## 2. Đặt mã nguồn

```bash
sudo mkdir -p /opt/novafilm && sudo chown "$USER" /opt/novafilm
cd /opt/novafilm
git clone <remote-cua-ban> .
git checkout <nhanh-can-trien-khai>
```

## 3. Cấu hình biến môi trường

```bash
cp deploy/.env.prod.example deploy/.env.prod
python3 -c "import secrets; print(secrets.token_urlsafe(48))"    # dán vào SECRET_KEY
chmod 600 deploy/.env.prod
```

`deploy/.env.prod` là file bí mật: `.gitignore` ở gốc chặn `.env`/`.env.*` trừ `*.example`,
và `backend/.dockerignore` chặn `.env` nên secret không lọt vào image. Kiểm tra trước khi
build:

```bash
git check-ignore -v deploy/.env.prod backend/.env
```

Bắt buộc sửa trong `deploy/.env.prod`:

| Biến | Ý nghĩa |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres của riêng NOVAFILM |
| `SECRET_KEY` | Sinh ngẫu nhiên. Còn giá trị mặc định mà `APP_ENV=production` thì tiến trình **từ chối khởi động** |
| `PUBLIC_BASE_URL` | Tiền tố link trong email và URL media |
| `CORS_ORIGINS` | Origin của frontend Firebase + origin admin + API. Sai ở đây thì trình duyệt báo CORS dù `curl` vẫn thấy bình thường |
| `OSS_CORS_EXTRA_ORIGINS` | Origin được ghi vào luật CORS của bucket OSS (nằm ngoài repo, xem mục 8) |
| `STATIC_HOST_ALLOWLIST` | Host phục vụ `/static` |
| `EPAY_NOTIFY_URL` | **Không chứa `/api/`** — WAF của pay.gitcc.com chặn |

Thêm khoá nhà cung cấp mô hình và (nếu dùng) khóa thanh toán vào `backend/.env`
trên VPS. File đó không nằm trong kho.

## 4. Kiểm tra cấu hình trước khi build

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod config >/dev/null \
  && echo "compose hợp lệ"        # config lỗi nghĩa là còn biến bắt buộc chưa điền
```

## 5. Build và khởi động

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod ps
```

Đợi tới khi `api` có trạng thái `healthy` (~40 giây). Ba healthcheck phải xanh:
`postgres` (`pg_isready`), `redis` (`redis-cli ping`), `api` (`/api/health`).

Kiểm tra:

```bash
curl -s http://127.0.0.1:8000/api/health | head -c 400
```

Cần thấy `"ok": true`. Nếu `api` restart liên tục:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod logs --tail 80 api
```

Các lỗi khởi động có chủ đích phải báo rõ ngay:
- `SECRET_KEY ... while APP_ENV='production'` → sinh lại khoá.
- `OAuth callback URL không hợp lệ: ...` → `OAUTH_REDIRECT_BASE_URL` không khớp
  luật của provider đang bật (ví dụ TikTok bắt buộc https).

## 6. nginx: TLS và tên miền

Cấu hình đúng phần này là thứ quyết định có bao giờ lộ `SECRET_KEY` ra ngoài không.

```nginx
server {
    listen 80;
    server_name api.novastudio.rr.kg;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.novastudio.rr.kg;

    ssl_certificate     /etc/letsencrypt/live/api.novastudio.rr.kg/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.novastudio.rr.kg/privkey.pem;

    # 视频成片动辄上百 MB：别让 nginx 提前掐断上传/回源
    client_max_body_size 512m;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`X-Forwarded-For` là bắt buộc: giới hạn tần suất `/api/auth/*` và link trong email
đều dựa vào IP thật, thiếu header thì mọi người bị tính chung một IP.

Vì sao phải bắt buộc: `deploy/docker-compose.yml` gán cổng 8000 vào `127.0.0.1`, nên
nginx là đường vào **duy nhất**. Nếu ai đó mở cổng 8000 ra ngoài, kẻ xấu tự bịa
`X-Forwarded-For` để né giới hạn tần suất và giả vị trí trong link email.

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -s https://api.novastudio.rr.kg/api/health | head -c 200
```

## 7. Đăng nhập bên thứ ba

Callback đăng ký trong console của từng provider, khớp **từng byte**:

```
https://api.novastudio.rr.kg/api/auth/google/callback
https://api.novastudio.rr.kg/api/auth/microsoft/callback
https://api.novastudio.rr.kg/api/auth/facebook/callback
https://api.novastudio.rr.kg/api/auth/tiktok/callback
```

| Provider | Console | Biến |
|---|---|---|
| Google | Cloud Console → Credentials → OAuth client ID (**Web**) | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| Microsoft | Entra → App registrations → Web platform | `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` |
| Facebook | Meta for Developers → Facebook Login → Settings (bật *Use App Authentication*, app ở chế độ Live) | `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` |
| TikTok | TikTok for Developers → Login Kit for Web | `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` |

Riêng TikTok: Redirect URL phải là https, tĩnh (không query, không fragment), ngắn hơn
512 ký tự; backend kiểm tra lúc khởi động. TikTok **không trả email**: lần đăng nhập đầu
tạo tài khoản chưa hoàn chỉnh, người dùng phải đặt email + mật khẩu qua
`POST /api/auth/oauth/setup` mới có JWT.

Đổi khoá trong `deploy/.env.prod` rồi `docker compose restart api` — không cần build lại.

## 8. Firebase Hosting (frontend)

`frontend/firebase.json` không khai domain nào: custom domain nằm ở console Firebase
(Hosting → Add custom domain). File đó cũng ghi rõ `/api`, `/static` và
`/epay/notify` **không** do Firebase phục vụ — Firebase Hosting không proxy được tới
một origin VPS bất kỳ, nên frontend phải gọi API chéo origin qua `VITE_API_BASE`.

```bash
cd frontend
VITE_API_BASE=https://api.novastudio.rr.kg npm run build
firebase deploy --hosting <site-id>
```

Cần CLI và đăng nhập sẵn: `npm i -g firebase-tools && firebase login`.
`<site-id>` xem bằng `firebase projects:list`. Không có `VITE_SITE_URL` trong source:
site URL của Firebase và domain staging là hai thứ khác nhau, cấu hình ở console
Firebase, không commit vào repo.

## 9. Cập nhật khi có code mới

```bash
cd /opt/novafilm && git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod ps   # đợi healthy
```

Cột thêm mới được thêm vào bằng `_apply_schema_patches()` trong `app/main.py` khi khởi
động, nên không cần chạy migration thủ công. **Luôn kiểm tra `/api/health` sau khi
deploy** — schema lệch là lỗi lộ ra ngay lúc đó chứ không phải giữa chừng lúc người
dùng đang dùng.

## 10. Danh sách kiểm tra

Sau mỗi lần deploy:

- [ ] `curl -s https://api.novastudio.rr.kg/api/health` → `"ok": true`
- [ ] `curl -s https://api.novastudio.rr.kg/api/auth/providers` → chỉ provider đã cấu hình
- [ ] Đăng nhập Google từ trình duyệt tới hết vòng authorize và nhận JWT
- [ ] Đăng nhập TikTok tạo tài khoản chưa hoàn chỉnh và buộc đặt email + mật khẩu
- [ ] Trang nạp tiền chặn tài khoản chưa hoàn chỉnh (HTTP 403)
- [ ] Upload ảnh lên và xem được (kiểm tra `CORS_ORIGINS` và luật CORS của bucket OSS)
- [ ] `docker compose ... logs --tail 200 api | grep -i "token\|secret"` → rỗng

## 11. Khi đổi staging → production

Đổi biến môi trường **không đủ**. Những việc sau nằm ngoài repo:

1. **Luật CORS của bucket OSS.** `ensure_browser_cors()` trong `app/services/oss.py`
   ghi luật lên bucket. Hàm này chỉ chạy khi `OSS_ENABLED=true`; mặc định đang là
   `false` nên hiện là no-op — phải sửa tay trong console Aliyun.
2. **Custom domain trong Firebase Hosting** (console Firebase, không phải file).
3. **Bản ghi DNS**: domain mới phải trỏ đúng, domain cũ phải tháo ra.
4. **`CORS_ORIGINS`** của FastAPI phải khai origin mới (biến thật, khác mục 1).
5. **`PUBLIC_BASE_URL`** của backend — dùng cho link email và URL media.

**Chưa chốt, cần quyết trước khi ra mắt:** nơi lưu và phát tán media. Với
`OSS_ENABLED=false`, FastAPI phục vụ `/static` từ đĩa VPS. Sản phẩm xử lý video mà
băng thông chạy trên một VPS là khoản chi phí phải tính trước. Cơ chế OSS sẵn có là
Aliyun (Trung Quốc) — độ trễ tới Việt Nam và người dùng quốc tế sẽ tệ. Cần chọn nhà
cung cấp lưu trữ trước khi ra mắt.

## 12. Lùi gói

```bash
cd /opt/novafilm && git log --oneline -1        # nhớ hash đang chạy
git checkout <hash-cu>                          # hoặc <tag>
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d --build
```

Cột đã thêm không tự xoá khi lùi code, và đó là có chủ đích: mất dữ liệu khi lùi
phiên bản là sự cố nghiêm trọng hơn nhiều so với một cột thừa.