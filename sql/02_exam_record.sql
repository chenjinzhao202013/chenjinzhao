-- =====================================================================
-- 02_exam_record.sql
-- 【同学 3：学生端考试全流程交互】所需的数据库补充脚本
-- ---------------------------------------------------------------------
-- 分工边界说明（重要）：
--   online_exam.sql 只有 4 张表：sys_user / exam_question_bank /
--   exam_question / exam_paper。学生端答题必须能把“考生的作答”存下来、
--   交卷后能查回“本人成绩与答题详情”，而原库没有任何这样的表，
--   因此本脚本补齐学生端所需的落库结构。
--
--   本脚本只包含【学生端直接需要】的内容：
--     第 1 节  exam_paper 补充考试起止时间（学生端要标注考试状态）
--     第 2 节  exam_record 考试记录表（学生端开考 / 交卷落库）
--     第 3 节  exam_record_answer 答题明细表（学生端自动保存 / 答卷详情）
--     第 4 节  学生端用到的查询 SQL
--     第 5 节  少量演示数据（保证学生端能独立演示）
--
--   不属于本模块、但学生端需要消费的接口（正式项目由对应同学提供）：
--     · 登录校验                      -> 同学 1：用户身份认证模块
--     · 题库/题目维护、题型定义        -> 同学 1：题库管理模块
--     · 组卷、试卷发布、考试起止时间    -> 同学 2：试卷管理模块
--     · 客观题自动判分、主观题批改、
--       全班成绩统计                  -> 同学 2：自动阅卷与成绩模块
--   学生端对这些内容只“调用 + 展示”，不实现其业务规则。
--
--   执行方式：mysql -u root -p online_exam < 02_exam_record.sql
-- =====================================================================

USE `online_exam`;

-- =====================================================================
-- 1. exam_paper 补充“考试起止时间”
-- ---------------------------------------------------------------------
-- 学生端的职责之一是“展示考试状态（未开始 / 进行中 / 已结束）”，
-- 该状态由开考时间、截止时间与当前时间比较得出。原库 exam_paper 只有
-- duration（时长），无法判断“现在能不能考”，因此需要这两列。
-- 列为 NULL 表示不限制时间（学生端该场显示“长期开放”）。
-- =====================================================================
ALTER TABLE `exam_paper`
  ADD COLUMN `exam_start_time` datetime DEFAULT NULL COMMENT '开考时间，NULL 表示不限制' AFTER `duration`,
  ADD COLUMN `exam_end_time`   datetime DEFAULT NULL COMMENT '考试截止时间，NULL 表示不限制' AFTER `exam_start_time`;

-- =====================================================================
-- 2. exam_record 考试记录表（一次开考 = 一行）
-- ---------------------------------------------------------------------
-- 学生端用途：
--   · 点“开始考试”时插入一行（status=0 进行中）并记录 start_time，
--     倒计时 = start_time + exam_paper.duration
--   · 交卷时回写用时、交卷方式、状态（得分由后端判分后回写）
--   · 再次进入时按 status=0 查找未交卷记录，实现“断点续答”
-- =====================================================================
DROP TABLE IF EXISTS `exam_record`;

CREATE TABLE `exam_record` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `paper_id` bigint(20) NOT NULL COMMENT '关联试卷ID（exam_paper.id）',
  `user_id` bigint(20) NOT NULL COMMENT '考生ID（sys_user.id，role=student）',
  `score` int(11) NOT NULL DEFAULT '0' COMMENT '最终得分（由后端判分回写）',
  `objective_score` int(11) NOT NULL DEFAULT '0' COMMENT '客观题得分',
  `subjective_score` int(11) NOT NULL DEFAULT '0' COMMENT '主观题得分（教师批改）',
  `total_score` int(11) NOT NULL DEFAULT '100' COMMENT '卷面总分（开考时快照）',
  `duration` int(11) NOT NULL DEFAULT '90' COMMENT '考试时长（分钟，开考时快照）',
  `used_seconds` int(11) NOT NULL DEFAULT '0' COMMENT '实际用时（秒）',
  `start_time` datetime NOT NULL COMMENT '开考时间，倒计时依据',
  `submit_time` datetime DEFAULT NULL COMMENT '交卷时间',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '状态：0-进行中，1-已提交待评阅，2-已评阅（成绩最终）',
  `submit_type` tinyint(1) NOT NULL DEFAULT '0' COMMENT '交卷方式：0-未交卷，1-手动提前交卷，2-超时自动强制交卷，3-超时未交（作废）',
  `tab_switch_count` int(11) NOT NULL DEFAULT '0' COMMENT '切屏/离开考试页次数（学生端防作弊上报）',
  `report_count` int(11) NOT NULL DEFAULT '0' COMMENT '违规行为上报次数',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0' COMMENT '逻辑删除',
  PRIMARY KEY (`id`),
  KEY `idx_paper_user` (`paper_id`,`user_id`) COMMENT '查某考生某试卷的记录',
  KEY `idx_user_status` (`user_id`,`status`) COMMENT '查某考生的进行中/已完成考试'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考试记录表';

-- =====================================================================
-- 3. exam_record_answer 答题明细表（一题一行）
-- ---------------------------------------------------------------------
-- 学生端用途：
--   · 自动保存 / 手动保存：把答题卡逐题写入或覆盖
--   · 交卷时携带全部作答提交
--   · 成绩页展示“答题详情（每题对错情况）”：你的答案、参考答案、解析
-- (record_id, question_id) 唯一键使“同一题重复保存”可用
-- INSERT ... ON DUPLICATE KEY UPDATE 直接覆盖
-- =====================================================================
DROP TABLE IF EXISTS `exam_record_answer`;

CREATE TABLE `exam_record_answer` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `record_id` bigint(20) NOT NULL COMMENT '关联考试记录ID（exam_record.id）',
  `question_id` bigint(20) NOT NULL COMMENT '关联题目ID（exam_question.id）',
  `user_answer` text COMMENT '考生作答：单选A、多选ABD、判断对/错、简答文本',
  `is_correct` tinyint(4) NOT NULL DEFAULT '-1' COMMENT '判分结果：1-正确，0-错误，-1-未判/待评阅（由后端写入）',
  `score` int(11) NOT NULL DEFAULT '0' COMMENT '本题实际得分（由后端写入）',
  `teacher_comment` varchar(500) DEFAULT NULL COMMENT '教师评语（主观题）',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_record_question` (`record_id`,`question_id`) COMMENT '同一场考试同一题只有一条作答',
  KEY `idx_question` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='答题明细表';

-- =====================================================================
-- 4. 学生端用到的查询 SQL（页面功能 -> SQL 对照，便于答辩说明）
-- =====================================================================

-- 4.1 可考考试列表 + 考试状态
--     学生端要展示“未开始 / 进行中 / 已结束”，并据此禁用开考按钮。
--     exam_start_time / exam_end_time 是本次补充的列（第 1 节）。
-- SELECT p.id, p.paper_name, p.total_score, p.duration,
--        p.exam_start_time, p.exam_end_time,
--        b.bank_name, b.subject,
--        COUNT(q.id)            AS question_count,
--        IFNULL(SUM(q.score),0) AS question_score,
--        CASE
--          WHEN NOW() < p.exam_start_time THEN '未开始'
--          WHEN NOW() > p.exam_end_time   THEN '已结束'
--          ELSE '进行中'
--        END AS exam_status,
--        TIMESTAMPDIFF(SECOND, NOW(), p.exam_start_time) AS seconds_to_start,
--        TIMESTAMPDIFF(SECOND, NOW(), p.exam_end_time)   AS seconds_to_end
--   FROM exam_paper p
--   LEFT JOIN exam_question_bank b ON b.id = p.bank_id AND b.is_deleted = 0
--   LEFT JOIN exam_question q      ON q.bank_id = p.bank_id AND q.is_deleted = 0
--  WHERE p.status = 1 AND p.is_deleted = 0
--  GROUP BY p.id
--  ORDER BY p.create_time DESC;

-- 4.2 开考前的状态校验（未开始 / 已结束一律不允许进入答题）
-- SELECT CASE
--          WHEN NOW() < exam_start_time THEN '未开始'
--          WHEN NOW() > exam_end_time   THEN '已结束'
--          ELSE '进行中'
--        END AS exam_status, exam_start_time, exam_end_time
--   FROM exam_paper WHERE id = ?;

-- 4.3 某场考试的题目（答题页数据源，按题型、ID 排序）
--     注意：学生端答题时【不要】SELECT answer / analysis，避免泄露答案；
--           参考答案与解析只在成绩页查询（见 4.10）。
-- SELECT id, question_type, question_content, option_a, option_b, option_c, option_d, score
--   FROM exam_question
--  WHERE bank_id = ? AND is_deleted = 0
--  ORDER BY question_type, id;

-- 4.4 查询本人是否有未交卷的考试（实现“断点续答”）
-- SELECT * FROM exam_record
--  WHERE paper_id = ? AND user_id = ? AND status = 0 AND is_deleted = 0
--  ORDER BY id DESC LIMIT 1;

-- 4.5 开考：新增考试记录（倒计时依据 start_time + duration）
-- INSERT INTO exam_record
--   (paper_id, user_id, total_score, duration, start_time, status, create_time, update_time)
-- VALUES (?, ?, ?, ?, NOW(), 0, NOW(), NOW());

-- 4.6 自动保存答题卡（同一题重复保存即覆盖）
-- INSERT INTO exam_record_answer (record_id, question_id, user_answer, is_correct, score)
-- VALUES (?, ?, ?, -1, 0)
-- ON DUPLICATE KEY UPDATE user_answer = VALUES(user_answer), update_time = NOW();

-- 4.7 交卷：上报答题卡与用时、交卷方式、切屏次数
-- UPDATE exam_record
--    SET submit_time = NOW(),
--        used_seconds = TIMESTAMPDIFF(SECOND, start_time, NOW()),
--        submit_type = ?,                       -- 1 手动提前交卷 / 2 超时自动强制交卷
--        tab_switch_count = ?
--  WHERE id = ? AND status = 0;

-- 4.8 判分结果回写（由同学 2 的自动阅卷模块执行，学生端只负责展示）
-- UPDATE exam_record
--    SET score = ?, objective_score = ?, subjective_score = ?, status = ?
--  WHERE id = ?;

-- 4.9 我的考试记录（成绩单列表）
-- SELECT r.id, r.score, r.objective_score, r.subjective_score, r.used_seconds,
--        r.submit_time, r.status, r.submit_type, p.paper_name, p.total_score
--   FROM exam_record r
--   LEFT JOIN exam_paper p ON p.id = r.paper_id
--  WHERE r.user_id = ? AND r.status <> 0 AND r.is_deleted = 0
--  ORDER BY r.submit_time DESC;

-- 4.10 答题详情（成绩页逐题展示对错、你的答案与参考答案）
-- SELECT a.question_id, a.user_answer, a.is_correct, a.score, a.teacher_comment,
--        q.question_type, q.question_content, q.option_a, q.option_b, q.option_c, q.option_d,
--        q.answer AS correct_answer, q.analysis, q.score AS full_score
--   FROM exam_record_answer a
--   JOIN exam_question q ON q.id = a.question_id
--  WHERE a.record_id = ?
--  ORDER BY q.question_type, q.id;

-- 4.11 分题型得分统计（成绩页的统计卡）
-- SELECT q.question_type,
--        COUNT(*)              AS question_count,
--        SUM(q.score)          AS full_score,
--        SUM(a.score)          AS got_score,
--        SUM(a.is_correct = 1) AS right_count
--   FROM exam_record_answer a
--   JOIN exam_question q ON q.id = a.question_id
--  WHERE a.record_id = ?
--  GROUP BY q.question_type;

-- =====================================================================
-- 5. 演示数据
-- ---------------------------------------------------------------------
-- 说明：以下数据用于让前端（js/mock-db.js）脱离后端也能演示学生端流程，
--       与前端 mock 数据保持一致。题库、试卷的组织与正确答案属于
--       同学 1 / 同学 2 的模块，这里只是最小可用的演示样本。
-- =====================================================================

-- 5.0 演示用考生账号（密码均为 MD5('123456')；student03 为禁用账号，用于测试登录拦截）
INSERT INTO `sys_user`
  (`id`,`username`,`password`,`real_name`,`role`,`phone`,`status`,`create_time`,`update_time`,`is_deleted`)
VALUES
  (4,'student02','e10adc3949ba59abbe56e057f20f883e','李四','student',NULL,1,'2026-10-05 09:12:00','2026-10-05 09:12:00',0),
  (5,'student03','e10adc3949ba59abbe56e057f20f883e','王五','student',NULL,0,'2026-10-05 09:12:00','2026-10-05 09:12:00',0);

-- 5.1 试卷 1 设为已发布、关联题库 2，并配置考试起止时间（= 进行中）
--     online_exam.sql 原值为 paper_name=''、bank_id=0、status=0（草稿）
UPDATE `exam_paper`
   SET `paper_name`      = 'Java基础期末考试试卷',
       `bank_id`         = 2,
       `status`          = 1,
       `exam_start_time` = DATE_SUB(NOW(), INTERVAL 1 DAY),
       `exam_end_time`   = DATE_ADD(NOW(), INTERVAL 6 DAY),
       `update_time`     = '2026-10-06 15:10:00'
 WHERE `id` = 1;

-- 5.2 另两份已发布试卷，用于演示“未开始 / 已结束”两种状态
INSERT INTO `exam_paper`
  (`id`,`paper_name`,`bank_id`,`total_score`,`duration`,`exam_start_time`,`exam_end_time`,
   `status`,`create_time`,`update_time`,`is_deleted`)
VALUES
  (3,'Java基础随堂小测（已结束）',1,100,20,
   DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY),
   1,'2026-10-05 11:20:00','2026-10-05 11:20:00',0),
  (4,'Java基础期中模拟测试（未开始）',2,100,60,
   DATE_ADD(NOW(), INTERVAL 3 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 3 DAY), INTERVAL 2 HOUR),
   1,'2026-10-06 16:40:00','2026-10-06 16:40:00',0);

-- 5.3 演示题库：题库 2（34 题 / 100 分）与题库 1（1 题 / 5 分）
--     题号 1、2、3 来自 online_exam.sql 的原始题，归入题库 2，以保证
--     “一份试卷 = 一个题库”的取题方式能得到满分 100 分
--     （题干、答案、分值、解析均未改动）。
INSERT INTO `exam_question_bank`
  (`id`,`bank_name`,`subject`,`description`,`create_time`,`update_time`,`is_deleted`)
VALUES
  (2,'Java基础综合题库','Java程序设计','Java基础期末统考题库：单选16 + 多选6 + 判断9 + 简答3，合计100分','2026-10-03 10:20:00','2026-10-03 10:20:00',0);

UPDATE `exam_question` SET `bank_id` = 2, `update_time` = '2026-10-06 15:10:00'
 WHERE `id` IN (1, 2, 3);

INSERT INTO `exam_question`
  (`id`,`bank_id`,`question_type`,`question_content`,`option_a`,`option_b`,`option_c`,`option_d`,
   `answer`,`score`,`analysis`,`create_time`,`update_time`,`is_deleted`)
VALUES
  (41,1,1,'下列哪个关键字用于定义接口？','class','interface','enum','struct','B',5,
   'Java 使用 interface 定义接口；class 定义类，enum 定义枚举。','2026-10-07 09:30:00','2026-10-07 09:30:00',0);

-- 题库 2 的 33 道自命题（单选15 + 多选6 + 判断9 + 简答2，与题号 1、2、3 合计 34 题 = 100 分）
INSERT INTO `exam_question`
  (`id`,`bank_id`,`question_type`,`question_content`,`option_a`,`option_b`,`option_c`,`option_d`,
   `answer`,`score`,`analysis`,`create_time`,`update_time`,`is_deleted`)
VALUES
  (10,2,1,'在Java中，用于定义常量的关键字是？','static','final','const','abstract','B',2,'final 修饰的变量为常量，赋值后不可修改；const 是Java保留字但不使用。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (11,2,1,'Java中 int 类型占用多少个字节？','2','4','8','16','B',2,'Java的int固定为4字节（32位），取值范围 -2^31 ~ 2^31-1，与平台无关。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (12,2,1,'下列哪个是Java中正确的 main 方法签名？','public void main(String args)','public static void main(String[] args)','static public main(String[] args)','public static main(String[] args)','B',2,'JVM 入口方法必须是 public static void main(String[] args)，顺序不能缺少返回类型。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (13,2,1,'Java中用于继承的关键字是？','implements','extends','inherits','super','B',2,'类继承使用 extends，接口实现使用 implements。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (14,2,1,'String 对象的长度通过哪个方法获取？','size()','length()','length','count()','B',2,'String 使用 length() 方法；数组用的是 length 属性；集合用 size()。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (15,2,1,'以下哪个关键字用于抛出异常？','throws','throw','catch','final','B',2,'throw 用于在方法体内抛出一个异常对象；throws 用于在方法声明处声明可能抛出的异常。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (16,2,1,'Java中所有类的直接或间接父类是？','Object','Class','System','Main','A',2,'java.lang.Object 是类层次结构的根类，所有类都直接或间接继承它。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (17,2,1,'ArrayList 与 LinkedList 相比，随机访问（get）效率的特点是？','ArrayList 更高','LinkedList 更高','完全相同','无法比较','A',2,'ArrayList 底层是数组，支持下标随机访问 O(1)；LinkedList 底层是双向链表，get 需要遍历 O(n)。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (18,2,1,'访问修饰符的可见范围由小到大排列正确的是？','private < default < protected < public','private < protected < default < public','default < private < protected < public','protected < private < public < default','A',2,'可见范围：private（本类）< 默认（同包）< protected（同包+子类）< public（所有）。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (19,2,1,'接口中的方法在 Java 8 之前默认的修饰符是？','public abstract','private','protected','static final','A',2,'Java 8 之前接口方法只能是 public abstract；Java 8 起支持 default 和 static 方法。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (20,2,1,'下列哪种集合允许存储重复元素且有序？','HashSet','TreeSet','ArrayList','HashMap的keySet','C',2,'List（ArrayList/LinkedList）有序且允许重复；Set 系列不允许重复。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (21,2,1,'StringBuilder 相对于 String 的主要优势是？','线程安全','拼接时不会频繁创建新对象','可以直接比较内容','支持下标访问','B',2,'String 不可变，每次拼接都会产生新对象；StringBuilder 在同一个可变字符数组上追加，效率更高。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (22,2,1,'异常处理中，无论是否发生异常都会执行的代码块是？','try','catch','finally','throws','C',2,'finally 块用于释放资源，除 System.exit 等极端情况外总会执行。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (23,2,1,'下列哪个不是 Java 的基本数据类型？','boolean','char','String','double','C',2,'Java 8 种基本类型：byte、short、int、long、float、double、char、boolean；String 是引用类型。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (24,2,1,'Java 源文件编译后生成的字节码文件扩展名是？','.java','.class','.jar','.exe','B',2,'javac 将 .java 源文件编译为 .class 字节码，由 JVM 加载执行。','2026-10-03 10:25:00','2026-10-03 10:25:00',0),
  (25,2,2,'下列属于 Java 面向对象三大特性的有？','封装','继承','多态','编译','ABC',4,'面向对象三大特性为封装、继承、多态；编译是程序构建过程而非特性。','2026-10-03 10:30:00','2026-10-03 10:30:00',0),
  (26,2,2,'关于 Java 集合框架，说法正确的有？','List 有序且允许重复','Set 不允许重复元素','Map 以键值对形式存储','Collection 是 Map 的子接口','ABC',4,'Map 与 Collection 是并列的两套体系，Map 并不是 Collection 的子接口。','2026-10-03 10:30:00','2026-10-03 10:30:00',0),
  (27,2,2,'下列属于 Java 基本数据类型的有？','int','boolean','String','char','ABD',4,'String 属于引用类型，其余均为基本数据类型。','2026-10-03 10:30:00','2026-10-03 10:30:00',0),
  (28,2,2,'关于方法重载（Overload），说法正确的有？','方法名相同','参数列表不同','与返回值类型无关','必须发生在同一个类中','ABCD',4,'重载要求同类中方法名相同、参数列表（个数/类型/顺序）不同，与返回值无关。','2026-10-03 10:30:00','2026-10-03 10:30:00',0),
  (29,2,2,'关于异常的叙述，正确的有？','Exception 是 Throwable 的子类','RuntimeException 属于非受检异常','finally 块总会执行','try 块可以没有 catch 也没有 finally','ABC',4,'try 必须至少搭配一个 catch 或 finally；其余说法正确。','2026-10-03 10:30:00','2026-10-03 10:30:00',0),
  (30,2,2,'下列哪些关键字可以修饰类？','final','abstract','static','public','ABD',4,'类可以被 final、abstract、public 修饰；static 只能修饰成员（内部类除外，此处不作考量）。','2026-10-03 10:30:00','2026-10-03 10:30:00',0),
  (31,2,3,'String 是可变对象，可以通过方法修改其内容。',NULL,NULL,NULL,NULL,'错',2,'String 是不可变对象，任何“修改”都会生成新的 String 对象。','2026-10-03 10:35:00','2026-10-03 10:35:00',0),
  (32,2,3,'构造方法的方法名必须与类名相同，并且没有返回值类型。',NULL,NULL,NULL,NULL,'对',2,'构造方法名与类名相同，不写返回值类型（连 void 也不能写）。','2026-10-03 10:35:00','2026-10-03 10:35:00',0),
  (33,2,3,'方法重载要求方法的返回值类型必须不同。',NULL,NULL,NULL,NULL,'错',2,'重载只与参数列表有关，返回值类型不同不构成重载。','2026-10-03 10:35:00','2026-10-03 10:35:00',0),
  (34,2,3,'Java 支持类的多继承，一个类可以同时 extends 多个父类。',NULL,NULL,NULL,NULL,'错',2,'Java 类只支持单继承，但接口可以多实现。','2026-10-03 10:35:00','2026-10-03 10:35:00',0),
  (35,2,3,'JDK 中包含 JRE，JRE 中包含 JVM。',NULL,NULL,NULL,NULL,'对',2,'包含关系：JDK ⊃ JRE ⊃ JVM。','2026-10-03 10:35:00','2026-10-03 10:35:00',0),
  (36,2,3,'接口中的变量默认是 public static final 的。',NULL,NULL,NULL,NULL,'对',2,'接口中的成员变量默认即 public static final 常量。','2026-10-03 10:35:00','2026-10-03 10:35:00',0),
  (37,2,3,'Java 中的数组一旦创建，其长度就不可改变。',NULL,NULL,NULL,NULL,'对',2,'数组长度固定（length 属性为 final），需要动态长度请使用集合。','2026-10-03 10:35:00','2026-10-03 10:35:00',0),
  (38,2,3,'RuntimeException 及其子类属于受检异常，必须显式处理。',NULL,NULL,NULL,NULL,'错',2,'RuntimeException 及其子类是非受检异常，编译器不强制要求 try-catch 或 throws。','2026-10-03 10:35:00','2026-10-03 10:35:00',0),
  (39,2,4,'请简述 Java 的异常处理机制（try-catch-finally 与 throws 的作用）。',NULL,NULL,NULL,NULL,'Java 使用 try 块包裹可能抛出异常的代码，catch 捕获并处理特定类型的异常，finally 块无论是否发生异常都会执行，通常用于释放资源；throws 写在方法声明处，用于把异常交给调用者处理。异常体系以 Throwable 为根，分为 Error 和 Exception，Exception 又分受检异常与非受检异常（RuntimeException）。',8,'参考答案：try 监控代码、catch 捕获处理、finally 释放资源、throws 声明抛出。答出 4 个要点各得 2 分。','2026-10-03 10:40:00','2026-10-03 10:40:00',0),
  (40,2,4,'请比较 List、Set、Map 三种集合的特点，并各举一个实现类。',NULL,NULL,NULL,NULL,'List 有序、可重复、支持下标访问，实现类如 ArrayList、LinkedList；Set 无序（HashSet）或不重复，不允许重复元素，实现类如 HashSet、TreeSet；Map 以键值对存储，键唯一，实现类如 HashMap、TreeMap。List 和 Set 属于 Collection 体系，Map 与 Collection 并列。',10,'参考答案：List 有序可重复（ArrayList）、Set 无序不可重复（HashSet）、Map 键值对键唯一（HashMap）。每种集合特点 2 分、实现类 1 分，体系说明 1 分。','2026-10-03 10:40:00','2026-10-03 10:40:00',0);

-- 5.4 一条完整的历史成绩（张三 · 试卷1 · 70 分 = 客观 58 + 主观 12）
--     34 题全部落库，学生端成绩页可逐题还原；第 1 题留空（未作答）
INSERT INTO `exam_record`
  (`id`,`paper_id`,`user_id`,`score`,`objective_score`,`subjective_score`,`total_score`,`duration`,
   `used_seconds`,`start_time`,`submit_time`,`status`,`submit_type`,`tab_switch_count`,`report_count`,
   `create_time`,`update_time`)
VALUES
  (1,1,3,70,58,12,100,90,2874,'2026-10-08 14:00:00','2026-10-08 14:47:54',2,1,1,1,
   '2026-10-08 14:00:00','2026-10-08 14:47:54');

INSERT INTO `exam_record_answer`
  (`id`,`record_id`,`question_id`,`user_answer`,`is_correct`,`score`,`teacher_comment`,`create_time`)
VALUES
  (1,1,1,'',0,0,NULL,'2026-10-08 14:47:54'),
  (2,1,10,'B',1,2,NULL,'2026-10-08 14:47:54'),
  (3,1,11,'B',1,2,NULL,'2026-10-08 14:47:54'),
  (4,1,12,'B',1,2,NULL,'2026-10-08 14:47:54'),
  (5,1,13,'B',1,2,NULL,'2026-10-08 14:47:54'),
  (6,1,14,'B',1,2,NULL,'2026-10-08 14:47:54'),
  (7,1,15,'B',1,2,NULL,'2026-10-08 14:47:54'),
  (8,1,16,'A',1,2,NULL,'2026-10-08 14:47:54'),
  (9,1,17,'A',1,2,NULL,'2026-10-08 14:47:54'),
  (10,1,18,'C',0,0,NULL,'2026-10-08 14:47:54'),
  (11,1,19,'A',1,2,NULL,'2026-10-08 14:47:54'),
  (12,1,20,'C',1,2,NULL,'2026-10-08 14:47:54'),
  (13,1,21,'B',1,2,NULL,'2026-10-08 14:47:54'),
  (14,1,22,'C',1,2,NULL,'2026-10-08 14:47:54'),
  (15,1,23,'C',1,2,NULL,'2026-10-08 14:47:54'),
  (16,1,24,'D',0,0,NULL,'2026-10-08 14:47:54'),
  (17,1,25,'ABC',1,4,NULL,'2026-10-08 14:47:54'),
  (18,1,26,'AB',0,2,NULL,'2026-10-08 14:47:54'),
  (19,1,27,'ABD',1,4,NULL,'2026-10-08 14:47:54'),
  (20,1,28,'ABCD',1,4,NULL,'2026-10-08 14:47:54'),
  (21,1,29,'ACD',0,0,NULL,'2026-10-08 14:47:54'),
  (22,1,30,'ABD',1,4,NULL,'2026-10-08 14:47:54'),
  (23,1,2,'对',1,2,NULL,'2026-10-08 14:47:54'),
  (24,1,31,'对',0,0,NULL,'2026-10-08 14:47:54'),
  (25,1,32,'对',1,2,NULL,'2026-10-08 14:47:54'),
  (26,1,33,'错',1,2,NULL,'2026-10-08 14:47:54'),
  (27,1,34,'错',1,2,NULL,'2026-10-08 14:47:54'),
  (28,1,35,'对',1,2,NULL,'2026-10-08 14:47:54'),
  (29,1,36,'对',1,2,NULL,'2026-10-08 14:47:54'),
  (30,1,37,'对',1,2,NULL,'2026-10-08 14:47:54'),
  (31,1,38,'对',0,0,NULL,'2026-10-08 14:47:54'),
  (32,1,3,'封装是把属性和方法包装在类里，隐藏实现细节；继承是子类复用父类的属性和方法，关键字是 extends；多态是同一个方法在不同对象上有不同的表现。',-1,7,'三个特性都答到了，但多态部分未区分编译期与运行期，扣 1 分。','2026-10-08 14:47:54'),
  (33,1,39,'把可能出错的代码放在 try 里，用 catch 捕获异常，finally 里的代码一定会执行。',-1,3,'只答出 try-catch-finally，遗漏 throws 与异常体系分类。','2026-10-08 14:47:54'),
  (34,1,40,'List 有序可重复，常用 ArrayList；Set 不允许重复元素，常用 HashSet；Map 以键值对存储，键唯一，常用 HashMap。',-1,2,'要点基本齐全，但未说明 List/Set 属于 Collection 体系、Map 与其并列，扣分较多。','2026-10-08 14:47:54');
