# Database Type Generation Script
# 导出 PostgreSQL schema 到 TypeScript types

param(
    [switch]$Up,      # 启动容器
    [switch]$Down,    # 停止容器
    [switch]$NoStart  # 不启动容器（假设已启动）
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    Write-Host "➜ $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

try {
    # 启动容器（如果需要）
    if ($Up) {
        Write-Status "Starting containers..."
        docker compose up -d
        Write-Status "Waiting for PostgreSQL to be healthy..."
        $retries = 0
        while ($retries -lt 30) {
            $status = docker compose ps postgres --format "{{.State}}"
            if ($status -like "*healthy*") {
                Write-Success "PostgreSQL is healthy"
                break
            }
            $retries++
            Start-Sleep -Seconds 2
        }
    }

    # 检查容器是否运行
    if (-not $NoStart) {
        Write-Status "Checking if server container is running..."
        $running = docker compose ps server --format "{{.State}}"
        if (-not $running) {
            Write-Error "Server container is not running. Run with -Up flag or start with 'docker compose up -d'"
            exit 1
        }
    }

    # 生成类型
    Write-Status "Generating database types..."
    docker compose exec -T server npm run generate:db

    # 检查文件是否生成
    if (Test-Path "server/src/types/database_schema.d.ts") {
        Write-Success "Database types generated to server/src/types/database_schema.d.ts"
    } else {
        Write-Error "Failed to generate database types"
        exit 1
    }

    # 停止容器（如果需要）
    if ($Down) {
        Write-Status "Stopping containers..."
        docker compose down
        Write-Success "Containers stopped"
    }
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
