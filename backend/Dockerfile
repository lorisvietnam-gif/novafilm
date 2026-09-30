# NOVAFILM API: FastAPI + FFmpeg, tiến trình tác vụ nền chạy cùng
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dựng phim cần FFmpeg; phụ đề tiếng Việt cần font. Font có dấu đủ để
# drawtext không vỡ dấu, nên phụ đề đốt lên video đọc được.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static

# Container chạy bằng user không phải root: một lỗ hổng leo thang không đi được
# tới tài khoản root của host. Chỉ hai thư mục dưới /app được quyền ghi.
RUN useradd --create-home --uid 10001 novafilm \
    && mkdir -p /app/static/generated /app/static/voice_previews \
    && chown -R novafilm:novafilm /app
USER novafilm

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=8 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]