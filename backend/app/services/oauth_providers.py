# -*- coding: utf-8 -*-
"""Danh bách khai báo của từng nhà cung cấp đăng nhập OAuth 2.0.

Một provider chỉ là MỘT DÒNG DỮ LIỆU, không phải một nhánh `if`. Toàn bộ đường đi của
đăng nhập (dựng URL authorize, đổi code lấy token, đọc userinfo, rút ra danh tính, kiểm
tra callback) đọc từ `PROVIDERS`; thêm provider mới = thêm một entry, không sửa logic.

Module này thuần khai báo: không gọi mạng, không đụng database, không import config.
Bí mật không bao giờ nằm ở đây — chỉ có *tên biến môi trường* chứa bí mật.

Đường dẫn trong userinfo là dotted path (`data.user.open_id`, `picture.data.url`) đọc bằng
`read_path` / `read_text`, nên provider trả JSON lồng nhau vẫn khai báo được như phẳng.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

# TikTok: không được đăng ký quá 10 callback, mỗi cái ngắn hơn 512 ký tự (Login Kit).
# Ta chỉ đăng ký đúng một URL nên giới hạn 10 nằm ở console, không ở backend; phần
# backend tự kiểm là https + tĩnh + độ dài.
TIKTOK_REDIRECT_MAX_LENGTH = 512


class RedirectUriError(Exception):
    """URL callback dựng ra vi phạm luật riêng của nhà cung cấp đó."""


@dataclass(frozen=True)
class ProviderSpec:
    """Mọi thứ backend cần biết về một provider. Không chứa secret."""

    id: str
    label: str
    # Khoá icon ổn định cho frontend; registry là nguồn danh sách provider duy nhất.
    icon_hint: str
    # False = đã biết chỗ để trong registry nhưng chưa được phép chạy (xem APPLE).
    implemented: bool

    authorize_url: str
    token_url: str
    # TikTok không có endpoint userinfo kiểu OIDC: danh tính nằm trong id_token mà
    # phải xác minh chữ ký bằng JWKS của Apple. Để rỗng để một bản dở không chạy được.
    userinfo_url: str
    # TikTok bắt buộc POST cho userinfo; còn lại đều GET.
    userinfo_method: str
    scope: tuple[str, ...]

    # Tên biến Settings chứa client id / secret (KHÔNG phải giá trị).
    client_id_env: str
    client_secret_env: str
    # TikTok đặt tên tham số là client_key chứ không phải client_id.
    token_param_client_id: str
    token_param_client_secret: str
    # form | json | query — cách gửi thân yêu cầu tới token endpoint.
    token_request_style: str

# Đường dẫn tới định danh ổn định trong userinfo. Đây là khoá nhận diện duy nhất.
    subject_id_path: str
    # None = provider không trả email (TikTok).
    email_path: str | None
    supports_email: bool
    # True = provider BẮT BUỘC PKCE. Ta luôn gửi PKCE dù cờ này là False.
    pkce_required: bool
    redirect_uri_template: str

    # Đường dẫn dự phòng, thử lần lượt khi email_path rỗng.
    email_fallback_paths: tuple[str, ...] = ()
    # Facebook dùng dấu phẩy, còn lại (Google, Microsoft, TikTok) dùng dấu cách.
    scope_separator: str = " "
    # None = provider không có khái niệm email đã xác minh (Facebook) -> coi là chưa xác minh.
    email_verified_path: str | None = None
    # Những đường dẫn mà bản thân provider chỉ phát ra khi đã xác minh sở hữu hộp thư,
    # nên khi claim thiếu vẫn được coi là đã xác minh. Microsoft chỉ bảo đảm điều này với
    # claim `email`, KHÔNG bảo đảm cho `preferred_username` (UPN do admin đặt).
    email_verified_implied_paths: tuple[str, ...] = ()
    name_path: str = ""
    avatar_path: str = ""
    # TikTok: callback phải là https, tĩnh (không query, không fragment), ngắn hơn 512 ký tự.
    redirect_uri_must_be_https: bool = False
    redirect_uri_must_be_static: bool = False
    redirect_uri_max_length: int = 0
    # Tham số bắt buộc thêm vào URL authorize.
    extra_authorize_params: tuple[tuple[str, str], ...] = ()


CALLBACK_TEMPLATE = "{base}/api/auth/{provider}/callback"


GOOGLE = ProviderSpec(
    id="google",
    label="Google",
    icon_hint="google",
    implemented=True,
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    token_url="https://oauth2.googleapis.com/token",
    userinfo_url="https://openidconnect.googleapis.com/v1/userinfo",
    userinfo_method="get",
    scope=("openid", "email", "profile"),
    client_id_env="google_client_id",
    client_secret_env="google_client_secret",
    token_param_client_id="client_id",
    token_param_client_secret="client_secret",
    token_request_style="form",
    subject_id_path="sub",
    email_path="email",
    email_verified_path="email_verified",
    name_path="name",
    avatar_path="picture",
    supports_email=True,
    pkce_required=True,
    redirect_uri_template=CALLBACK_TEMPLATE,
    # access_type=online: không dùng refresh token, chỉ cần token ngắn để đọc hồ sơ.
    extra_authorize_params=(("access_type", "online"),),
)

MICROSOFT = ProviderSpec(
    id="microsoft",
    label="Microsoft",
    icon_hint="microsoft",
    implemented=True,
    # "common" nhận cả tài khoản thuê bao Entra lẫn tài khoản cá nhân Microsoft.
    authorize_url="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token_url="https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userinfo_url="https://graph.microsoft.com/oidc/userinfo",
    userinfo_method="get",
    scope=("openid", "email", "profile"),
    client_id_env="microsoft_client_id",
    client_secret_env="microsoft_client_secret",
    token_param_client_id="client_id",
    token_param_client_secret="client_secret",
    token_request_style="form",
    subject_id_path="sub",
    email_path="preferred_username",
    email_fallback_paths=("email",),
    email_verified_path="email_verified",
    email_verified_implied_paths=("email",),
    name_path="name",
    supports_email=True,
    pkce_required=True,
    redirect_uri_template=CALLBACK_TEMPLATE,
    # Không có prompt=select_account thì trình duyệt đã đăng nhập thuê bao khác sẽ vào
    # nhầm tài khoản.
    extra_authorize_params=(("prompt", "select_account"),),
)

FACEBOOK = ProviderSpec(
    id="facebook",
    label="Facebook",
    icon_hint="facebook",
    implemented=True,
    authorize_url="https://www.facebook.com/v21.0/dialog/oauth",
    token_url="https://graph.facebook.com/v21.0/oauth/access_token",
    userinfo_url=(
        "https://graph.facebook.com/v21.0/me?fields=id,name,email,picture.type(large)"
    ),
    userinfo_method="get",
    scope=("public_profile", "email"),
    scope_separator=",",
    client_id_env="facebook_client_id",
    client_secret_env="facebook_client_secret",
    token_param_client_id="client_id",
    token_param_client_secret="client_secret",
    token_request_style="form",
    subject_id_path="id",
    email_path="email",
    # Không có trường verified -> mọi email Facebook đều là CHƯA xác minh (nhánh B).
    email_verified_path=None,
    name_path="name",
    avatar_path="picture.data.url",
    supports_email=True,
    pkce_required=False,
    redirect_uri_template=CALLBACK_TEMPLATE,
)

TIKTOK = ProviderSpec(
    id="tiktok",
    label="TikTok",
    icon_hint="tiktok",
    implemented=True,
    authorize_url="https://www.tiktok.com/v2/auth/authorize/",
    token_url="https://open.tiktokapis.com/v2/oauth/token/",
    userinfo_url="https://open.tiktokapis.com/v2/userinfo/",
    userinfo_method="post",
    scope=("user.info.basic",),
    client_id_env="tiktok_client_key",
    client_secret_env="tiktok_client_secret",
    # TikTok gọi là client_key, không phải client_id.
    token_param_client_id="client_key",
    token_param_client_secret="client_secret",
    token_request_style="form",
    subject_id_path="data.user.open_id",
    # Login Kit không trả email. Đây là lý do nhánh B tồn tại.
    email_path=None,
    name_path="data.user.display_name",
    avatar_path="data.user.avatar_url",
    supports_email=False,
    pkce_required=True,
    redirect_uri_template=CALLBACK_TEMPLATE,
    redirect_uri_must_be_https=True,
    redirect_uri_must_be_static=True,
    redirect_uri_max_length=TIKTOK_REDIRECT_MAX_LENGTH,
)

APPLE = ProviderSpec(
    id="apple",
    label="Apple",
    icon_hint="apple",
    # CHƯA LÀM, và cố tình không bật. Hai lý do, đều cần tiền hoặc việc làm đúng:
    #   1. Apple bắt trả 99 USD/năm cho chương trình Developer.
    #   2. Sign in with Apple trả danh tính trong id_token (JWT), không có endpoint
    #      userinfo kiểu OIDC. Phải lấy chữ ký, xác minh bằng JWKS
    #      https://appleid.apple.com/auth/keys và kiểm tra `aud`/`iss`/`nonce`.
    #      Làm vội để "cho có" là cách nhanh nhất để tạo lỗ hổng giả mạo tài khoản.
    # Giữ entry này để chỗ đã có; implemented=False nên nó KHÔNG xuất hiện ở
    # GET /api/auth/providers và require_provider() từ chối nó.
    implemented=False,
    authorize_url="https://appleid.apple.com/auth/authorize",
    token_url="https://appleid.apple.com/auth/token",
    userinfo_url="",
    userinfo_method="get",
    scope=("name", "email"),
    client_id_env="apple_client_id",
    client_secret_env="apple_client_secret",
    token_param_client_id="client_id",
    token_param_client_secret="client_secret",
    token_request_style="form",
    subject_id_path="sub",
    email_path="email",
    # Apple ký email trong id_token sau khi đã xác minh, nên claim là bằng chứng.
    email_verified_path="email_verified",
    email_verified_implied_paths=("email",),
    name_path="name",
    supports_email=True,
    pkce_required=False,
    redirect_uri_template=CALLBACK_TEMPLATE,
    extra_authorize_params=(("response_mode", "form_post"),),
)

# Thứ tự chèn là thứ tự GET /api/auth/providers báo cáo.
PROVIDERS: dict[str, ProviderSpec] = {
    spec.id: spec for spec in (GOOGLE, MICROSOFT, FACEBOOK, TIKTOK, APPLE)
}


def provider_specs(*, implemented_only: bool = True) -> tuple[ProviderSpec, ...]:
    """Các provider mà bản dựng này biết chạy."""
    specs = PROVIDERS.values()
    return tuple(spec for spec in specs if spec.implemented) if implemented_only else tuple(specs)


def find_spec(provider_id: str) -> ProviderSpec | None:
    """Tra registry theo id, trả về None nếu không phải provider của ta."""
    return PROVIDERS.get(str(provider_id or "").strip().lower())


def scope_string(spec: ProviderSpec) -> str:
    """Scope gửi đi luôn là chuỗi, nối bằng phân tách mà provider đó yêu cầu."""
    return spec.scope_separator.join(spec.scope)


# ------------------------------------------------------------- đọc JSON lồng nhau


def read_path(payload: dict[str, Any], path: str) -> Any:
    """Đọc một dotted path trong JSON đã giải mã; None nếu thiếu hoặc gãy."""
    node: Any = payload
    for part in str(path or "").split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def read_text(payload: dict[str, Any], path: str) -> str:
    """Đọc dotted path rồi chuẩn hoá thành chuỗi đã cắt khoảng trắng."""
    value = read_path(payload, path)
    if isinstance(value, bool) or value is None:
        return ""
    if isinstance(value, (str, int, float)):
        return str(value).strip()
    return ""


def read_bool(payload: dict[str, Any], path: str) -> bool:
    """Claim boolean của OIDC tới dạng JSON, nhưng một số provider gửi chuỗi."""
    value = read_path(payload, path)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() == "true"
    return False


def read_verified_flag(payload: dict[str, Any], spec: ProviderSpec, email_path: str) -> bool:
    """Provider có xác nhận sở hữu hộp thư không?

    Có claim `email_verified` thì tin nó, kể cả khi là false. Không có claim thì chỉ
    được coi là đã xác minh khi email đến từ đúng đường dẫn mà provider bảo đảm đã kiểm
    tra — ví dụ claim `email` của Microsoft, nhưng KHÔNG phải `preferred_username`
    (UPN do quản trị viên tenant tự đặt, không chứng minh gì).
    """
    if spec.email_verified_path and read_path(payload, spec.email_verified_path) is not None:
        return read_bool(payload, spec.email_verified_path)
    return email_path in spec.email_verified_implied_paths


# ------------------------------------------------------- kiểm tra URL callback


def validate_redirect_uri(spec: ProviderSpec, redirect_uri: str) -> str:
    """Chặn URL callback không đạt luật của chính provider đó, nói rõ biến nào sai.

    Gọi lúc khởi động: một callback không đăng ký được thì báo ngay còn hơn để người dùng
    bấm nút rồi mới nhận `redirect_uri_mismatch` từ phía provider.
    """
    uri = str(redirect_uri or "").strip()
    parts = urlsplit(uri)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise RedirectUriError(
            f"{spec.label}: URL callback phải là http(s)://host[:port], nhận được {uri!r}"
        )
    # Fragment không được phép ở bất kỳ provider nào: nó không tới được máy chủ.
    if parts.fragment:
        raise RedirectUriError(f"{spec.label}: URL callback không được chứa fragment")
    if spec.redirect_uri_must_be_https and parts.scheme != "https":
        raise RedirectUriError(
            f"{spec.label}: URL callback bắt buộc phải là https, nhận được {uri!r}"
        )
    if spec.redirect_uri_must_be_static and parts.query:
        raise RedirectUriError(
            f"{spec.label}: URL callback phải tĩnh, không được có query string"
        )
    if spec.redirect_uri_max_length and len(uri) >= spec.redirect_uri_max_length:
        raise RedirectUriError(
            f"{spec.label}: URL callback phải ngắn hơn {spec.redirect_uri_max_length} ký tự "
            f"(đang dài {len(uri)})"
        )
    return uri