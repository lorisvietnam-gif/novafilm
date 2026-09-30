# NOVAFILM 部署（VPS + Docker Compose）

> 前端是 **Firebase Hosting 上的静态文件**，后端是 **这台 VPS 上的 Docker Compose**。
> 上线手册见 [`../docs/VPS_DEPLOY_RUNBOOK.md`](../docs/VPS_DEPLOY_RUNBOOK.md)。

## 分工

| 组件 | 运行方式 | 对外 |
|------|----------|------|
| 前端 / 管理后台 | Firebase Hosting（`firebase.json` 所在仓库构建） | `novastudio.rr.kg` |
| FastAPI | Docker（`backend/Dockerfile`，容器内非 root） | 经 nginx，API 子域 |
| PostgreSQL / Redis | Docker | 只绑 `127.0.0.1`，不对公网 |

## 1. 启动

```bash
cp deploy/.env.prod.example deploy/.env.prod   # 改密码、SECRET_KEY、域名
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod ps
```

`deploy/.env.prod` 里每个 `${VAR}` 都没有默认值：漏配会在 `up` 时直接报错，
不会让容器带着别人的口令启动。**`deploy/.env.prod` 不进版本库。**

没有写死 `container_name`：compose 用项目名 `novafilm` 加前缀生成容器名
（`novafilm-api-1`），这样同一台机器上跑多个项目不会撞名。查容器名直接用
`docker compose -f deploy/docker-compose.yml ps`。

## 2. 数据与备份

需要持久化的只有四个卷：`postgres_data`、`redis_data`、`media`（成片/分镜）、
`voice_previews`。备份就是备份这四个：

```bash
# 数据库（$$ 让变量在容器内展开，而不是在你的 shell 里）
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod \
  exec -T postgres sh -c 'pg_dump -U "$$POSTGRES_USER" "$$POSTGRES_DB"' | gzip > backup-$(date +%F).sql.gz

# 素材（卷名前缀是项目名）
docker run --rm -v novafilm_media:/data -v "$PWD":/out alpine \
  tar czf /out/media-$(date +%F).tar.gz -C /data .
```

## 3. 第三方登录

回调地址一律形如：

```
https://api.novastudio.rr.kg/api/auth/<provider>/callback
```

必须与 provider 控制台登记的地址**逐字节相同**：不加结尾 `/`，不加 query，
不用 `127.0.0.1` 换 `localhost`。TikTok 另有硬性要求（https、无 query/fragment、
短于 512 字符），`app/main.py` 在导入时就会校验并报错。

相关变量与各家控制台的登记位置见 `deploy/.env.prod.example` 和
`backend/.env.example` 的注释。上线后自查：

```bash
curl -s https://api.novastudio.rr.kg/api/auth/providers
```

只应出现真正配好的 provider。

## 运维

```bash
# 日志
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod logs -f api
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod logs -f postgres

# 停（保留数据）
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod down

# 重建镜像（改过 backend/ 之后）
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod up -d --build

# 停并删卷（会清库/清素材，慎用）
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.prod down -v
```

任务并发通过 `backend/.env` 的 `TASK_RUNTIME_MAX_CONCURRENCY`、
`TASK_USER_MAX_CONCURRENCY` 调整统一任务平台并发。