FROM postgres:18-bookworm

# 更新包管理器
RUN apt-get update && apt-get install -y \
    postgresql-contrib-18 \
    && rm -rf /var/lib/apt/lists/*

# 复制初始化脚本
COPY init.sql /docker-entrypoint-initdb.d/

# 暴露 PostgreSQL 默认端口
EXPOSE 5432

# 设置启动命令
CMD ["postgres"]