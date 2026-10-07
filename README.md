# 同学 3：学生端考试全流程交互

基于 `online_exam.sql` 数据库设计的学生端网页实现，覆盖 **查看考试 → 在线答题 → 交卷判分 → 成绩解析** 的完整交互流程。

> **演示版说明**：按要求已**移除登录界面**（原登录页 `page-login.js` 及 `#/login` 路由均已删除）。进入页面时系统会自动以演示考生 `student01` 登录，因此打开即可直接看到考试列表；`sys_user` 表的账号校验逻辑（MD5 摘要、角色、禁用状态）仍保留在 `api.js:login` 中，接真实后端时可直接启用。

---

## 一、如何查看运行

### 方式一：直接打开（零配置，推荐演示）
双击 `index.html`，或拖动到浏览器窗口打开即可。
数据由 `js/mock-db.js` 提供（`online_exam.sql` 的完整镜像），考试记录写入浏览器 `localStorage`。

> 建议使用 Chrome / Edge 打开；Firefox 对 `file://` 协议支持同样良好。

### 方式二：本地静态服务器（更接近真实部署）
```bash
# 在 online-exam-student 目录下任选一种
python -m http.server 8080
# 或
npx serve .
```
然后访问 `http://localhost:8080/`。

### 演示账号
当前版本自动登录 `student01`（密码 `123456`，与 `sys_user.password` 的 MD5 摘要一致）。
`sys_user` 表中另有两个账号，供接真实后端时的登录校验使用：

| 账号 | 姓名 | 说明 |
| --- | --- | --- |
| `student01` | 学生张三 | 正常考生，已有 1 条历史成绩（自动登录使用） |
| `student02` | 李四 | 正常考生，无历史成绩 |
| `student03` | 王五 | 账号已禁用（`status=0`），用于验证登录拦截 |
| `teacher01` | 张老师 | 教师角色，登录校验会提示“本系统为学生端” |

### 数据自检（可选，用于自证学生端数据通路无误）
打开页面后按 <kbd>F12</kbd>，在控制台输入：

```js
selfTest()
```

会逐项校验并打印结果（通过/失败计数，共 **25 项**），全部围绕**学生端自己的职责**：
演示账号能否登录、可考列表是否带考试状态与开考资格、未开始 / 已结束的试卷是否被拒绝开考、
答题页取题是否**拿不到答案**、开考 / 断点续答 / 暂存答案 / 交卷上报 / 查询本人成绩与答题详情是否串得通。

> 判分规则、题库组织、试卷配置属于同学 1 / 同学 2 的模块，本自检**只验证能否正确调用并拿到结果**，
> 不校验他们的业务规则。此脚本为只读检查，可从 `index.html` 中直接移除。

> 也可以在 Node 环境下离线跑（不需要浏览器）：
> ```powershell
> cd online-exam-student
> node _verify_selftest.js       # 学生端数据自检：当前 25/25 通过
> node _smoke_test.js            # 端到端冒烟：自动登录→列表→开考→交卷→成绩页（当前 22/22）
> ```
> 两个脚本都用极简 DOM stub 载入全部 js 文件真实执行，适合无浏览器时做回归自检；均为只读检查，可直接删除。

---

## 一之二、用 Git 做版本管理

项目已经准备好 Git 所需的一切，只差本机安装 Git。

### 第 1 步：安装 Git（本机目前没有）

任选一种：

```powershell
# 方式 A：winget（在普通 PowerShell 窗口里执行，不要用受限终端）
winget install --id Git.Git -e --source winget
```
- 方式 B：从 <https://git-scm.com/download/win> 下载安装包，**安装时勾选 “Add Git to PATH”**
- 方式 C：在 IntelliJ IDEA 里 `File → Settings → Version Control → Git`，点 `Download and Install`

装完**重新打开**终端，用 `git --version` 确认能输出版本号。

### 第 2 步：一键初始化仓库

直接**双击**项目里的 `git-init.bat` 即可（身份信息已预填为你给的值）：
`user.name = chenjinzhao202013`，`user.email = 3184568097@qq.com`

它依次做这些事：写入提交身份 → `git init`（分支 `main`）→ `git add -A` → 首次提交 → 打印提交记录。

### 第 3 步（手动等价命令，想自己敲就用这段）

```powershell
cd D:\实验\专业设计\online-exam-student

git config --global user.name  "chenjinzhao202013"
git config --global user.email "3184568097@qq.com"
git config --global init.defaultBranch main
git config --global core.quotepath false     # 中文文件名在 git status 里正常显示
git config --global core.autocrlf true       # Windows 换行处理

git init
git add -A
git commit -m "学生端考试全流程交互：可考列表与状态标注、整卷/逐题答题、倒计时与自动交卷、成绩与答题详情"
git log --oneline
```

### 提交范围：什么会被提交、什么被忽略

`.gitignore` 已配置好，规则如下：

| 提交 | 忽略 |
| --- | --- |
| `index.html`、`css/`、`js/`（全部页面与脚本） | `.idea/`（含本机绝对路径与项目 ID，属个人 IDE 配置） |
| `sql/02_exam_record.sql` | `node_modules/`、`dist/`、`build/` |
| `README.md`、`git-init.bat` | `*.log`、`_selftest_out.txt` 等运行产物 |
| `_verify_selftest.js`、`_smoke_test.js`（可复现的自检脚本） | `Thumbs.db`、`~$*.doc` 等系统/Office 临时文件 |

> `.idea/` 之所以忽略：里面的 `workspace.xml` 记录了本机路径与随机的 ProjectId，属于个人环境配置；
> 如果小组约定要共享 IDE 配置，把 `.gitignore` 里 `.idea/` 一行删掉即可。

---

## 二、文件结构

```
online-exam-student/
├── index.html                  页面外壳：顶栏、路由挂载点、Toast、确认框
├── css/
│   └── style.css               全部样式（含答题卡、成绩单、响应式）
├── js/
│   ├── md5.js                  纯前端 MD5（与库中密码摘要算法一致）
│   ├── mock-db.js              online_exam 库的前端镜像（表结构 + 数据 + 种子写入）
│   ├── api.js                  ★ 数据访问层，所有 SQL 集中在此，替换后端只改这里
│   ├── ui.js                   公共 UI：提示、确认框、格式化、DOM 工具
│   ├── app.js                  路由与会话（#/exam-list、#/exam、#/result）+ 演示账号自动登录
│   ├── selftest.js             数据自检脚本（控制台 selfTest()，可删除）
│   ├── page-exam-list.js       ① 考试列表页（含考试状态标注）
│   ├── page-exam.js            ② 在线答题页（核心，整卷/逐题双模式）
│   └── page-result.js          ③ 成绩与答卷解析页
├── sql/
│   └── 02_exam_record.sql      学生端所需落库结构（考试起止时间 / 考试记录 / 答题明细）+ 学生端查询 SQL + 演示数据
├── _verify_selftest.js         Node 环境离线跑自检的脚本（可删除）
├── _smoke_test.js              Node 环境端到端冒烟测试（可删除）
└── README.md
```

---

## 三、数据库对应关系

> **分工边界**：本模块（同学 3）只负责**学生端页面与其直接需要的落库结构**。
> 登录校验、题库维护、组卷与试卷发布、自动判分、全班统计分别属于同学 1 /
> 同学 2 的模块，学生端对它们**只调用、只展示**，不实现其业务规则。

### 3.1 学生端消费的表（由其他同学维护）

| 表名 | 归属 | 学生端用途 |
| --- | --- | --- |
| `sys_user` | 同学 1（身份认证） | 登录校验（`username` + `password`(MD5) + `role='student'` + `status=1`） |
| `exam_question_bank` | 同学 1（题库管理） | 展示试卷所属题库与科目 |
| `exam_question` | 同学 1（题库管理） | 取题干、选项、题型、分值用于作答 |
| `exam_paper` | 同学 2（试卷管理） | 可考列表、时长、卷面总分、**考试起止时间**（用于状态标注） |

### 3.2 学生端补充的表 / 列（本模块交付）

| 对象 | 为什么需要 |
| --- | --- |
| `exam_paper.exam_start_time` / `exam_end_time`（补充 2 列） | 原库只有 `duration`，无法判断“现在能不能考”，而学生端要**标注考试状态**（未开始 / 进行中 / 已结束）并据此禁用开考按钮 |
| `exam_record`（补充表） | 原库没有任何表保存考生的开考与交卷，学生端交卷后数据无处落库；`status=0` 也是**断点续答**的依据 |
| `exam_record_answer`（补充表） | 承载学生端的**自动保存**（同一题覆盖写入）与成绩页的**答题详情** |

> 补充脚本见 `sql/02_exam_record.sql`：第 1–3 节是学生端需要的落库结构，第 4 节是学生端用到的 11 段查询 SQL（含考试状态的 `CASE WHEN` 写法），第 5 节是可独立演示的少量数据。
>
> 演示内置了一条完整的历史成绩（张三 · Java基础期末考试试卷 · **70 分 = 客观题 58（单选 26 + 多选 18 + 判断 14）+ 主观题 12**），试卷 34 道题的作答明细全部落库，成绩单可逐题还原，用于直接演示“查看答卷”。该记录会在页面**首次加载时由 `mock-db.js` 的 `seedStores()` 写入 localStorage**。

### 3.3 关键字段说明

- `exam_question.question_type`：`1` 单选、`2` 多选、`3` 判断（答案存 `对/错`）、`4` 简答。需求文档提到的“填空题”在原库中没有独立类型，统一按**主观题**（`4` 简答）处理，由教师端批改——学生端只负责渲染作答控件。
- `exam_paper.exam_start_time` / `exam_end_time`：**补充列**，用于判定考试状态；为 `NULL` 表示不限制（页面显示“长期开放”）。
- 考试状态：`未开始`（当前 < 开考时间）、`进行中`（在时间窗口内，唯一允许进入答题的状态）、`已结束`（当前 > 截止时间）、`已完成`（本人已交卷）。
- `exam_record.status`：`0` 进行中、`1` 已提交待评阅、`2` 已评阅（成绩最终）
- `exam_record.submit_type`：`1` 手动提前交卷、`2` 超时自动强制交卷、`3` 超时未交（作废）
- `exam_record.start_time` + `exam_paper.duration` = **倒计时截止时间**（刷新/重进时按原开考时间继续扣时）

### 3.4 演示数据的调整（已在 `mock-db.js` 与 SQL 注释中标注）

为保证学生端能独立演示，试卷与题库做了一点补充（题库内容本身属于同学 1 / 同学 2 的范围，这里只是最小可用样本）：

1. 原库 `exam_paper` 只有 1 行，且 `paper_name=''`、`bank_id=0`、`status=0`（草稿）。演示中补全为已发布试卷「Java基础期末考试试卷」，关联 `bank_id=2`，并设置考试起止时间。
2. 演示题库：**题库 2 = 34 题（单选 16×2 + 多选 6×4 + 判断 9×2 + 简答 8+8+10 = 100 分）**，与试卷 1 的 `total_score=100` 吻合；
   - **试卷 3「Java基础随堂小测（已结束）」→ 题库 1（1 题 5 分），已结束**：演示“题库实际分值 < 卷面总分”的橙色提示（`score_mismatch`）与**已结束**状态（按钮禁用）；
   - **试卷 4「Java基础期中模拟测试（未开始）」→ 题库 2，未开始**：演示**未开始**状态与“x 天后开考”提示；
   - 试卷 2 保持 `status=0` 草稿，用于验证学生端**看不到未发布试卷**。

---

## 四、各页面功能与交互点

> 登录界面已按要求删除；账号校验能力保留在 `api.js:login`（消费同学 1 的接口），演示版由 `app.js:autoLogin()` 自动以 `student01` 登录。

### ① 考试列表页 `page-exam-list.js`
- 只查询 `status=1 AND is_deleted=0` 的已发布试卷，草稿卷不可见；
- **考试状态标注**：按 `exam_start_time / exam_end_time` 与当前时间比较，实时显示 `未开始`（附“x 天后开考”）/ `进行中`（附“剩余 x”）/ `已结束` / `已完成`；
- 每行展示：试卷名、题库/科目、题量、**题库实际总分**、时长、**考试时间窗口**、考试状态、我的最好成绩；
- 按钮随状态变化：`开始考试`（进行中且未考过）/ `继续考试`（有未交卷的记录）/ **`查看成绩`（已交卷）**；**未开始与已结束的试卷按钮置为禁用**并给出原因提示；
- **一次考试只能考一次**：已交卷的试卷不再提供作答入口，只显示“本场已交卷，不能重考”，点击「查看成绩」进入成绩单；
- 顶部统计卡：已发布考试数、已完成场次、平均分、最高分；
- 底部「我的考试记录」表格可进入成绩单，另有「清空本机考试缓存」便于反复演示。

### ② 在线答题页 `page-exam.js`（核心）
| 功能 | 说明 |
| --- | --- |
| **整卷 / 逐题双模式** | 顶栏可切换：**逐题切换**（一次一题，上一题/下一题）与**整卷展示**（全部题目同屏滚动，答题卡点击题号快速定位）；快捷键 `M` 切换 |
| **倒计时** | 依据 `start_time + duration` 计算，剩 5 分钟提示、剩 1 分钟变红闪烁，归零**自动强制交卷** |
| **答题卡** | 按题量自动生成格子（本演示 34 格）：已答（蓝）、未答（灰）、当前题（描边）、标记待检查（角标），点击任意题号跳转 |
| **题型适配** | 单选 radio、多选 checkbox（实时显示已选几项）、判断「√正确 / ×错误」、简答 textarea（实时字数统计） |
| **自动保存** | 作答后 1.2 秒静默保存 + 每 20 秒兜底保存，顶栏实时显示「保存中… / 已保存 15:04:12」 |
| **断点续答** | 未交卷的考试刷新或重进页面时自动恢复进度与剩余时间，并提示「已恢复上次答题进度」 |
| **手动提前交卷** | 交卷前弹窗列出未答题号、标记题号、剩余时间；点「再检查一下」自动跳到第一道未答题；**交卷后锁定全部作答控件，不可修改答案** |
| **防作弊** | 监听页面切屏（`visibilitychange`）并累计上报，答满 3 次给出红色警告；离开页面弹原生确认框；屏蔽右键菜单 |
| **键盘快捷键** | `A/B/C/D` 选选项、`←/→` 翻题、`M` 切换整卷/逐题、`F` 标记待检查、`Ctrl+Enter` 交卷 |

### ③ 成绩与答卷解析页 `page-result.js`
- 圆环得分图（得分率、及格线 60% 配色）+ 考生/时间/用时/交卷方式/客观题与主观题得分明细；
- 四张分题型统计卡：该题型题量、得分/满分、答对题数；
- 逐题解析：你的答案 vs 参考答案对照、正确选项高亮绿色、错误选择高亮红色、展示 `exam_question.analysis` 解析与教师评语；
- 主观题标注「待教师评阅」，页面顶部提示预评分可能变动；
- 支持「返回列表」「打印/导出成绩单」（走浏览器打印）；
- **不提供“再考一次”**：一次考试只能考一次，页面明确提示“本场已交卷，不能重复作答”。

---

## 五、判分：同学 2 的模块，学生端只调用

> **这不是本模块的实现。** 按分工，“交卷后客观题自动判分、主观题交由教师端批改”属于
> **同学 2：自动阅卷与成绩模块**。学生端在交卷时只做一件事：**把答题卡上报**；
> 得分由后端判分后返回，学生端负责展示。

为了让前端脱离后端也能演示，`api.js` 中保留了一段**明确标注为占位**的判分实现
（`gradeChoice / gradeEssay / grade`，见文件顶部注释），其规则如下——**仅供演示，
正式以同学 2 的模块为准**：

| 题型 | 占位规则 |
| --- | --- |
| 单选题 | 与 `answer` 完全一致得满分，否则 0 分 |
| 多选题 | 完全一致得满分；漏选得一半分（向下取整）；错选得 0 分 |
| 判断题 | `对/错` 一致得满分 |
| 简答题 | 按参考答案切分要点，命中比例 × 分值，作为机器预评分 |

接入同学 2 的判分接口时，把 `api.js:submitExam` 中的判分调用替换为
“上报答题卡 + 接收成绩”即可，页面代码无需改动。

---

## 六、功能对照表（对应《专业实践》分工文档）

### 6.1 逐条对应“同学 3：学生端考试全流程交互”

| 文档要求（原文要点） | 实现位置 | 说明 |
| --- | --- | --- |
| 实现学生端**可考考试列表** | `page-exam-list.js` | 只列出 `exam_paper.status=1` 的已发布试卷，展示题量、分值、时长、考试时间窗口、我的最好成绩 |
| **展示考试状态**（未开始 / 进行中 / 已结束） | `page-exam-list.js` + `api.js:paperStatus` | 依 `exam_start_time / exam_end_time` 实时计算；未开始/已结束的试卷**禁用开考按钮**，服务端侧 `startExam` 再次拦截 |
| **核心答题界面**：题目展示 | `page-exam.js:renderSingleView / renderFullView` | 四种题型控件，题干与选项完整呈现 |
| **逐题切换** | `page-exam.js:goTo` | 上一题/下一题按钮、答题卡点选、`←/→` 快捷键 |
| **整卷展示** | `page-exam.js:renderFullView` | 全部题目同屏滚动，点击答题卡题号平滑定位；`M` 键切换两种模式 |
| **倒计时提醒** | `page-exam.js:tick` | 顶栏 `HH:MM:SS`，剩 5 分钟提示、剩 1 分钟变红闪烁 |
| **自动强制交卷** | `page-exam.js:tick → doSubmit(true)` | 倒计时归零自动保存并交卷判分，`submit_type=2` |
| **手动提前交卷** | `page-exam.js:confirmSubmit → doSubmit(false)` | 交卷确认弹窗列出未答/标记题，可一键跳转补答，`submit_type=1` |
| **提交后不可修改答案** | `page-exam.js:doSubmit` | 交卷瞬间禁用全部输入控件与按钮；`api.js:submitExam` 拒绝 `status<>0` 的重复提交 |
| 学生端**个人成绩查询** | `page-result.js` | 得分圆环、及格判定、客观/主观得分、用时、交卷方式、分题型统计 |
| **答题详情展示（每题对错情况）** | `page-result.js:reviewItem` | 逐题标注 ✔回答正确 / ✘回答错误 / △少选得分 / 未作答，你的答案与参考答案对照，展示解析与教师评语 |
| 学生端**页面布局、交互体验优化** | `css/style.css` + `ui.js` | 统一视觉规范、响应式（1080/860/640 三档断点）、Toast 提示、确认弹窗、加载态与空状态 |

### 6.2 考试流程环节与实现位置

| 考试流程环节 | 实现位置 | 关键交互 |
| --- | --- | --- |
| 演示账号登录 | `app.js:autoLogin` + `api.js:login` | 进入页面自动以 `student01` 登录；账号校验（MD5/角色/禁用）逻辑保留，接后端时直接启用 |
| 查看可参加考试 | `page-exam-list.js` | 只显示已发布试卷、考试状态标注、历史最好成绩、待考统计 |
| 开始 / 继续考试 | `page-exam-list.js` + `api.js:startExam` | 时间窗口校验、**已交卷的试卷拒绝再次开考**、未交卷自动续考（倒计时按原开考时间继续） |
| **一次考试只能考一次** | `api.js:startExam` + `page-exam-list.js:actionCell` + `page-result.js` | 已交卷后列表改为「查看成绩」并提示“本场已交卷，不能重考”；即使直接改地址访问 `#/exam?paperId=x` 也会被 `startExam` 拒绝 |
| 在线答题 | `page-exam.js` | 整卷/逐题双模式、四种题型控件、答题卡跳转、标记待检查 |
| 自动保存 | `page-exam.js` + `api.js:saveDraft` | 作答 1.2 秒后保存 + 20 秒兜底，状态提示 |
| 倒计时与超时交卷 | `page-exam.js:tick/doSubmit` | 5 分钟/1 分钟提醒，归零自动交卷 |
| 防作弊 | `page-exam.js:bindGuards` | 切屏计数上报、离开确认、禁用右键 |
| 交卷确认 | `page-exam.js:confirmSubmit` | 列出未答/标记题，可一键跳转补答 |
| 成绩查询 | `page-result.js` | 得分圆环、分题型统计、及格判定 |
| 答卷解析 | `page-result.js:reviewItem` | 你的答案 vs 参考答案、选项标注、解析与评语 |
| 交卷上报与归档 | `api.js:submitExam` | 上报答题卡并落库 `exam_record` + `exam_record_answer`（**判分由同学 2 的模块完成**，见第五节） |

### 6.3 与文档的差异说明

- 文档“题库管理模块”提到**单选题、多选题、填空题**三种基础题型；本次使用的库中 `exam_question.question_type` 实际定义为 **1 单选 / 2 多选 / 3 判断 / 4 简答**，没有独立的“填空题”。学生端按数据库定义渲染四种作答控件，并把“填空题”归入**主观题（`4` 简答）**处理（题型定义本身属同学 1 的题库模块，学生端只适配）。
- 文档“简化方案：不开放学生自主注册，由教师后台统一添加学生账号”“不设计 A/B 卷、补考、重考等复杂考试策略”已遵守：本端不提供注册入口；**同一份试卷只能考一次**，交卷后不再提供作答入口（`api.js:startExam` 会拒绝已交卷的试卷重复开考）。

---

## 七、如何从演示数据切换到真实数据库

数据层已做隔离，**页面代码完全不需要改动**：

1. 执行 `sql/02_exam_record.sql` 补齐学生端需要的落库结构（考试记录、答题明细、考试起止时间）；
2. 把 `js/api.js` 中每个方法的 mock 实现替换为 `fetch` 调用，方法上方的注释已写明对应 SQL；
3. 其他同学的模块按下述方式对接（学生端只调用，不实现）：
   ```js
   // 登录：改为调用同学 1 的登录接口
   login: (u, p) => fetch('/api/login', { method:'POST', body: JSON.stringify({ username:u, password:p }) }).then(r => r.json())
   // 交卷：改为“上报答题卡”，成绩由同学 2 的判分模块返回
   submitExam: (recordId, opts) => fetch('/api/exam/submit', { method:'POST', body: JSON.stringify({ recordId, ...opts }) }).then(r => r.json())
   ```
4. 若后端返回结构与本文件保持一致（`{ paper, questions, record, details }`），前端零改动。

> 安全提示：真实部署时，`exam_question.answer`、`analysis` 字段**不能**下发给答题页（本实现启动考试时已不下发答案，仅在成绩页查询）；判分必须在服务端完成，`api.js` 中的判分实现仅为演示占位。

---

## 八、数据库脚本对应清单（答辩可对照说明）

| 页面动作 | 对应 SQL |
| --- | --- |
| 登录 | `SELECT ... FROM sys_user WHERE username=? AND password=MD5(?) AND is_deleted=0` |
| 考试列表 + **考试状态** | `exam_paper LEFT JOIN exam_question_bank/exam_question`（`status=1`），状态用 `CASE WHEN NOW() < exam_start_time THEN '未开始' WHEN NOW() > exam_end_time THEN '已结束' ELSE '进行中' END` |
| 时间窗口校验 | `SELECT CASE ... END AS exam_status FROM exam_paper WHERE id=?`（非“进行中”则拒绝开考） |
| 开始/续考 | `SELECT * FROM exam_record WHERE paper_id=? AND user_id=? AND status=0`；否则 `INSERT INTO exam_record` |
| 保存答案 | `INSERT INTO exam_record_answer ... ON DUPLICATE KEY UPDATE user_answer=VALUES(user_answer)` |
| 交卷 | `UPDATE exam_record SET score=?,objective_score=?,subjective_score=?,submit_time=NOW(),used_seconds=?,status=?,submit_type=? WHERE id=?` |
| 成绩列表 | `exam_record LEFT JOIN exam_paper WHERE user_id=? AND status<>0` |
| 答卷解析 | `exam_record_answer JOIN exam_question WHERE record_id=?` |
| 分题型统计 | `... GROUP BY q.question_type` |

完整 SQL 语句见 `sql/02_exam_record.sql` 第 4 节；第 5 节是可直接执行的演示数据（含考试起止时间、试卷关联调整、题库 2 的 34 道题、张三 70 分历史成绩及其 34 条答题明细），执行后数据库与前端演示数据完全一致。
