# ============================================================
#  git-init.ps1 —— 一键把本项目初始化为 Git 仓库（PowerShell 版）
#
#  用法（在 PowerShell 里执行）：
#      cd 'D:\实验\专业设计\online-exam-student'
#      powershell -ExecutionPolicy Bypass -File .\git-init.ps1
#
#  本文件是 UTF-8 with BOM 编码，PowerShell 5.1 能正确识别中文。
# ============================================================

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$GitName  = 'chenjinzhao202013'
$GitEmail = '3184568097@qq.com'

Write-Host ''
Write-Host '==== [1/5] 检查 Git 是否可用 ====' -ForegroundColor Cyan
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Write-Host ''
    Write-Host '[错误] 没找到 git 命令。' -ForegroundColor Red
    Write-Host '  1) 先安装 Git for Windows：https://git-scm.com/download/win'
    Write-Host '  2) 安装向导的 PATH 页面请选：'
    Write-Host '     "Git from the command line and also from 3rd-party software"'
    Write-Host '  3) 装完关掉所有终端，重新打开，再运行本脚本。'
    Write-Host ''
    exit 1
}
Write-Host ('Git 版本：' + (& git --version))

Write-Host ''
Write-Host '==== [2/5] 写入提交身份 ====' -ForegroundColor Cyan
& git config --global user.name  $GitName
& git config --global user.email $GitEmail
& git config --global init.defaultBranch main
& git config --global core.quotepath false     # 中文文件名正常显示
& git config --global core.autocrlf true       # Windows 换行处理
Write-Host ("已设置：" + $GitName + " / " + $GitEmail)

Write-Host ''
Write-Host '==== [3/5] 初始化仓库 ====' -ForegroundColor Cyan
if (Test-Path -LiteralPath (Join-Path $PWD '.git')) {
    Write-Host '已存在 .git，跳过初始化。'
} else {
    & git init
}

Write-Host ''
Write-Host '==== [4/5] 暂存文件（.gitignore 已排除 .idea 等）====' -ForegroundColor Cyan
& git add -A
& git status --short

Write-Host ''
Write-Host '==== [5/5] 首次提交 ====' -ForegroundColor Cyan
$msg = '学生端考试全流程交互：可考列表与状态标注、整卷/逐题答题、倒计时与自动交卷、成绩与答题详情'
& git commit -m $msg
if ($LASTEXITCODE -ne 0) {
    Write-Host '[提示] 提交未成功：若提示 nothing to commit 说明没有改动；若提示缺少身份请检查第 2 步。' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '==== 完成，最近一次提交 ====' -ForegroundColor Green
& git log --oneline -1
Write-Host ''
Write-Host ('仓库位置：' + $PWD)
Write-Host '常用命令：'
Write-Host '  git status          查看改动'
Write-Host '  git add -A          暂存全部改动'
Write-Host '  git commit -m "..." 提交'
Write-Host '  git log --oneline   查看历史'
Write-Host ''
