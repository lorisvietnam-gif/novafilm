"""Tải ảnh lên khi OSS tắt: ghi xuống đĩa, không để lọt path traversal.

Hai tầng:
1. ``save_local_upload`` / ``resolve_image_upload_type`` trong storage — thuần đĩa, offline.
2. Endpoint ``upload_asset_media`` — cần DB test, ép ``oss_enabled=False``.

Không test nào chạm mạng.
"""

from __future__ import annotations

import io

import pytest
from fastapi import HTTPException, UploadFile

from app.services import storage as storage_svc

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64
# RIFF....WEBP
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 64


@pytest.fixture
def static_root(tmp_path, monkeypatch):
    """STATIC_ROOT trỏ vào tmp_path để không đụng backend/static thật."""
    root = tmp_path / "static"
    (root / "generated").mkdir(parents=True)
    monkeypatch.setattr(storage_svc, "STATIC_ROOT", root)
    monkeypatch.setattr(storage_svc, "GENERATED_ROOT", root / "generated")
    return root


# --- tên tệp từ người dùng: chỉ lấy phần mở rộng, không lấy đường dẫn ---------------


@pytest.mark.parametrize(
    "filename",
    [
        "../../../etc/passwd.png",
        "..\\..\\..\\windows\\system32\\evil.png",
        "/etc/cron.d/evil.png",
        "C:\\Users\\Public\\evil.png",
        "....//....//evil.png",
    ],
)
def test_resolve_type_accepts_traversal_filename_only_as_extension(filename: str) -> None:
    """Tên độc hại vẫn ra phần mở rộng sạch — không mang theo đường dẫn nào."""
    ext, content_type = storage_svc.resolve_image_upload_type(None, filename)
    assert ext == ".png"
    assert content_type == "image/png"


@pytest.mark.parametrize(
    "filename",
    [
        "evil.png\u0000.txt",
        "evil.png\u0000",
        "\u0000.png",
    ],
)
def test_resolve_type_rejects_control_characters(filename: str) -> None:
    """NUL byte là cách cũ để cắt chuỗi ở tầng C; nằm trong tên là mùi tấn công."""
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.resolve_image_upload_type(None, filename)


@pytest.mark.parametrize(
    "filename",
    [
        "../../evil.php",
        "..\\evil.aspx",
        "evil.svg",
        "evil.html",
        "evil.exe",
        "noextension",
        "",
        None,
    ],
)
def test_resolve_type_rejects_non_image_filenames(filename: str | None) -> None:
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.resolve_image_upload_type(None, filename)


@pytest.mark.parametrize(
    ("content_type", "ext"),
    [
        ("image/png", ".png"),
        ("image/jpeg", ".jpg"),
        ("image/jpg", ".jpg"),
        ("image/webp", ".webp"),
        ("image/gif", ".gif"),
        ("IMAGE/PNG", ".png"),
        ("image/png; charset=binary", ".png"),
    ],
)
def test_resolve_type_accepts_allowed_content_types(content_type: str, ext: str) -> None:
    assert storage_svc.resolve_image_upload_type(content_type, "anything.bin")[0] == ext


@pytest.mark.parametrize(
    "content_type",
    ["text/html", "image/svg+xml", "application/x-msdownload", "application/pdf", "video/mp4"],
)
def test_resolve_type_rejects_explicitly_declared_non_image(content_type: str) -> None:
    """Client nói thẳng đây không phải ảnh thì không cho đổi tên để lách."""
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.resolve_image_upload_type(content_type, "a.png")


@pytest.mark.parametrize("content_type", ["", None, "application/octet-stream"])
def test_resolve_type_falls_back_to_extension_for_generic_types(content_type: str | None) -> None:
    """Browser hay gửi octet-stream / không gửi gì; khi đó mới đọc tên tệp."""
    ext, _ct = storage_svc.resolve_image_upload_type(content_type, "holiday.JPEG")
    assert ext == ".jpg"
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.resolve_image_upload_type(content_type, "holiday.docx")


def test_traversal_filename_lands_inside_project_dir(static_root) -> None:
    """Tên tệp độc hại không thể đưa file ra khỏi static/generated/p{project}."""
    _path, url = storage_svc.save_local_upload(
        io.BytesIO(PNG),
        project_id=4242,
        stem="asset_7",
        ext=".png",
    )
    assert url.startswith("/static/generated/p4242/")
    written = list((static_root / "generated" / "p4242").iterdir())
    assert len(written) == 1
    assert ".." not in written[0].name
    assert written[0].name.startswith("asset_7_")


# --- nội dung: magic bytes, không tin content type ---------------------------------


@pytest.mark.parametrize(
    ("ext", "data"),
    [((".png"), PNG), (".jpg", JPEG), (".gif", GIF), (".webp", WEBP)],
)
def test_save_accepts_real_images(static_root, ext: str, data: bytes) -> None:
    path, url = storage_svc.save_local_upload(
        io.BytesIO(data), project_id=1, stem="asset_1", ext=ext
    )
    assert path.read_bytes() == data
    assert url.endswith(path.name)


@pytest.mark.parametrize(
    ("ext", "data"),
    [
        (".png", b"<html><script>alert(1)</script></html>"),
        (".png", b"MZ\x90\x00exe"),
        (".png", b"%PDF-1.7"),
        (".png", b'<?xml version="1.0"?><svg onload="alert(1)"/>'),
        (".png", b"\x00\x00\x00\x00"),
    ],
)
def test_save_rejects_non_image_content_despite_whitelisted_ext(
    static_root, ext: str, data: bytes
) -> None:
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.save_local_upload(
            io.BytesIO(data), project_id=2, stem="asset_2", ext=ext
        )
    # không có file nào được tạo ra, kể cả thư mục rỗng
    assert list(static_root.rglob("*.png")) == []
    assert list(static_root.rglob("*.jpg")) == []


def test_sniffed_extension_wins_over_lying_content_type(static_root) -> None:
    """Khai image/png nhưng gửi JPEG: file lưu đúng phần mở rộng của byte thật."""
    path, _url = storage_svc.save_local_upload(
        io.BytesIO(JPEG), project_id=3, stem="asset_3", ext=".png"
    )
    assert path.suffix == ".jpg"


# --- giới hạn và dọn dẹp -----------------------------------------------------------


def test_rejects_empty_file(static_root) -> None:
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.save_local_upload(
            io.BytesIO(b""), project_id=4, stem="asset_4", ext=".png"
        )


def test_rejects_oversize_and_leaves_nothing(static_root) -> None:
    big = PNG + b"\x00" * 5000
    with pytest.raises(storage_svc.UploadRejected) as err:
        storage_svc.save_local_upload(
            io.BytesIO(big), project_id=5, stem="asset_5", ext=".png", max_bytes=100
        )
    assert "不能超过" in err.value.detail
    assert list(static_root.rglob("*.png")) == []


def test_size_limit_measured_while_streaming_not_by_header(static_root) -> None:
    """Không tin kích thước client khai: byte đếm thật khi ghi."""
    data = PNG + b"\x00" * 4096
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.save_local_upload(
            io.BytesIO(data), project_id=6, stem="asset_6", ext=".png", max_bytes=1000
        )
    assert list(static_root.rglob("*.png")) == []


@pytest.mark.parametrize("stem", ["../evil", "..", "a/b", "a\\b", "", "x" * 65, "a.b", "é"])
def test_rejects_unsafe_stem(static_root, stem: str) -> None:
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.save_local_upload(
            io.BytesIO(PNG), project_id=7, stem=stem, ext=".png"
        )


@pytest.mark.parametrize("ext", [".php", ".html", ".svg", ".exe", "png", "/etc/x.png"])
def test_rejects_unsafe_extension(static_root, ext: str) -> None:
    with pytest.raises(storage_svc.UploadRejected):
        storage_svc.save_local_upload(io.BytesIO(PNG), project_id=8, stem="asset_8", ext=ext)


def test_never_overwrites_existing_file(static_root) -> None:
    """Tên sinh ra phải là tên mới: file đang ở đó không bị ghi đè."""
    dest_dir = static_root / "generated" / "p9"
    dest_dir.mkdir(parents=True)
    existing = dest_dir / "asset_9_keepme.png"
    existing.write_bytes(b"keep")

    for _ in range(3):
        path, _url = storage_svc.save_local_upload(
            io.BytesIO(PNG), project_id=9, stem="asset_9", ext=".png"
        )
        assert path != existing

    assert existing.read_bytes() == b"keep"


def test_url_is_server_generated_and_resolvable(static_root) -> None:
    path, url = storage_svc.save_local_upload(
        io.BytesIO(PNG), project_id=10, stem="asset_10", ext=".png"
    )
    assert url == storage_svc.rel_static_url(path)
    assert storage_svc.local_path_from_url(url) == path
    assert "asset_10" in url and url.endswith(".png")


# --- endpoint ----------------------------------------------------------------------


def _upload_file(data: bytes, filename: str, content_type: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(data),
        filename=filename,
        headers={"content-type": content_type},
    )


@pytest.mark.asyncio
async def test_endpoint_saves_to_disk_when_oss_disabled(db_session, monkeypatch, tmp_path) -> None:
    from tests.conftest import make_user
    from app.api.drama.assets import upload_asset_media
    from app.models_drama import DramaAsset, DramaProject

    root = tmp_path / "static"
    (root / "generated").mkdir(parents=True)
    monkeypatch.setattr(storage_svc, "STATIC_ROOT", root)
    monkeypatch.setattr(storage_svc, "GENERATED_ROOT", root / "generated")
    monkeypatch.setattr("app.services.oss.oss_enabled", lambda: False)

    user = await make_user(db_session)
    project = DramaProject(user_id=user.id, title="P")
    db_session.add(project)
    await db_session.flush()
    asset = DramaAsset(project_id=project.id, type="character", asset_type="image", name="Hero")
    db_session.add(asset)
    await db_session.commit()

    out = await upload_asset_media(
        asset_id=asset.id,
        file=_upload_file(PNG, "../../../evil.png", "image/png"),
        db=db_session,
        user=user,
    )

    assert out.url and out.cover == out.url
    assert out.url.startswith("/static/generated/")
    written = list((root / "generated").rglob("*.png"))
    assert len(written) == 1
    assert ".." not in written[0].name
    assert written[0].read_bytes() == PNG


@pytest.mark.asyncio
async def test_endpoint_rejects_traversal_content_when_oss_disabled(
    db_session, monkeypatch, tmp_path
) -> None:
    from tests.conftest import make_user
    from app.api.drama.assets import upload_asset_media
    from app.models_drama import DramaAsset, DramaProject

    root = tmp_path / "static"
    (root / "generated").mkdir(parents=True)
    monkeypatch.setattr(storage_svc, "STATIC_ROOT", root)
    monkeypatch.setattr(storage_svc, "GENERATED_ROOT", root / "generated")
    monkeypatch.setattr("app.services.oss.oss_enabled", lambda: False)

    user = await make_user(db_session)
    project = DramaProject(user_id=user.id, title="P")
    db_session.add(project)
    await db_session.flush()
    asset = DramaAsset(project_id=project.id, type="character", asset_type="image")
    db_session.add(asset)
    await db_session.commit()

    with pytest.raises(HTTPException) as err:
        await upload_asset_media(
            asset_id=asset.id,
            file=_upload_file(b"<html>evil</html>", "shot.png", "image/png"),
            db=db_session,
            user=user,
        )
    assert err.value.status_code == 400
    # không file nào được ghi, dù thư mục project có thể đã được tạo
    assert list(root.rglob("*.png")) == []


@pytest.mark.asyncio
async def test_endpoint_rejects_non_image_type(db_session, monkeypatch, tmp_path) -> None:
    from tests.conftest import make_user
    from app.api.drama.assets import upload_asset_media
    from app.models_drama import DramaAsset, DramaProject

    monkeypatch.setattr("app.services.oss.oss_enabled", lambda: False)
    user = await make_user(db_session)
    project = DramaProject(user_id=user.id, title="P")
    db_session.add(project)
    await db_session.flush()
    asset = DramaAsset(project_id=project.id, type="character", asset_type="image")
    db_session.add(asset)
    await db_session.commit()

    with pytest.raises(HTTPException) as err:
        await upload_asset_media(
            asset_id=asset.id,
            file=_upload_file(b"MZ\x00binary", "payload.png", "application/x-msdownload"),
            db=db_session,
            user=user,
        )
    assert err.value.status_code == 400


@pytest.mark.asyncio
async def test_endpoint_still_404s_for_other_users_asset(db_session, monkeypatch, tmp_path) -> None:
    """Không mở chức năng upload thì cũng không nới quyền sở hữu."""
    from tests.conftest import make_user
    from app.api.drama.assets import upload_asset_media
    from app.models_drama import DramaAsset, DramaProject

    monkeypatch.setattr("app.services.oss.oss_enabled", lambda: False)
    owner = await make_user(db_session)
    other = await make_user(db_session)
    project = DramaProject(user_id=owner.id, title="P")
    db_session.add(project)
    await db_session.flush()
    asset = DramaAsset(project_id=project.id, type="character", asset_type="image")
    db_session.add(asset)
    await db_session.commit()

    with pytest.raises(HTTPException) as err:
        await upload_asset_media(
            asset_id=asset.id,
            file=_upload_file(PNG, "a.png", "image/png"),
            db=db_session,
            user=other,
        )
    assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_uses_oss_when_enabled(db_session, monkeypatch) -> None:
    """OSS bật thì hành vi cũ giữ nguyên: gọi upload_fileobj, không ghi đĩa."""
    from tests.conftest import make_user
    from app.api.drama.assets import upload_asset_media
    from app.models_drama import DramaAsset, DramaProject

    seen: dict = {}

    def _fake_upload_fileobj(fileobj, object_key, *, content_type="application/octet-stream"):
        seen["key"] = object_key
        seen["content_type"] = content_type
        seen["bytes"] = fileobj.read()
        return f"https://cdn.example.com/{object_key}"

    monkeypatch.setattr("app.services.oss.oss_enabled", lambda: True)
    monkeypatch.setattr("app.services.oss.folder_prefix", lambda: "novafilm")
    monkeypatch.setattr("app.services.oss.upload_fileobj", _fake_upload_fileobj)

    user = await make_user(db_session)
    project = DramaProject(user_id=user.id, title="P")
    db_session.add(project)
    await db_session.flush()
    asset = DramaAsset(project_id=project.id, type="character", asset_type="image")
    db_session.add(asset)
    await db_session.commit()

    out = await upload_asset_media(
        asset_id=asset.id,
        file=_upload_file(PNG, "a.png", "image/png"),
        db=db_session,
        user=user,
    )

    assert out.url.startswith("https://cdn.example.com/novafilm/generated/p")
    assert seen["bytes"] == PNG
    assert seen["content_type"] == "image/png"