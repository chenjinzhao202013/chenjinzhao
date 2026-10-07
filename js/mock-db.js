/* ============================================================
 * mock-db.js —— online_exam 数据库的前端镜像（学生端演示用）
 * ------------------------------------------------------------
 * 用途：让【学生端】脱离后端也能演示。字段名与数据库列名保持一致，
 *       方便后续替换为真实接口（见 api.js 顶部说明）。
 *
 * 分工说明：
 *   · sys_user / exam_question_bank / exam_question / exam_paper
 *       —— 分别属于同学 1（身份认证、题库管理）与同学 2（试卷管理），
 *          这里只是照抄现有数据供学生端消费，本模块不定义其结构；
 *   · exam_record / exam_record_answer
 *       —— 学生端自己需要的落库结构（开考、交卷、答题明细），
 *          因此由本模块补充，见 sql/02_exam_record.sql；
 *   · exam_paper.exam_start_time / exam_end_time
 *       —— 学生端要标注“未开始 / 进行中 / 已结束”，需要试卷有起止时间，
 *          原库只有 duration，故补充这两列。
 * ============================================================ */
(function (global) {
  'use strict';

  /* 与 online_exam.sql 中的 6 位时间字符串保持一致的辅助函数 */
  function ts(datetimeStr) { return datetimeStr; }

  /* 演示用：以“现在”为基准生成考试起止时间，保证三种考试状态都能看到 */
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(d) {
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
           p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }
  function makeTime(daysOffset, hours, minutes) {
    var d = new Date();
    d.setDate(d.getDate() + daysOffset);
    d.setHours(hours, minutes, 0, 0);
    return fmt(d);
  }

  var DB = {

    /* ---------------- sys_user ---------------- */
    sys_user: [
      { id: 1, username: 'admin',     password: 'e10adc3949ba59abbe56e057f20f883e', real_name: '系统管理员', role: 'admin',   phone: null, status: 1, create_time: ts('2026-10-02 22:01:53'), update_time: ts('2026-10-06 14:55:33'), is_deleted: 0 },
      { id: 2, username: 'teacher01', password: 'e10adc3949ba59abbe56e057f20f883e', real_name: '张老师',    role: 'teacher', phone: null, status: 1, create_time: ts('2026-10-02 22:01:53'), update_time: ts('2026-10-06 14:55:33'), is_deleted: 0 },
      { id: 3, username: 'student01', password: 'e10adc3949ba59abbe56e057f20f883e', real_name: '学生张三',  role: 'student', phone: null, status: 1, create_time: ts('2026-10-02 22:01:53'), update_time: ts('2026-10-06 14:55:33'), is_deleted: 0 },
      /* 演示用扩展账号：多考生用于验证考试记录按 user_id 隔离 */
      { id: 4, username: 'student02', password: 'e10adc3949ba59abbe56e057f20f883e', real_name: '李四',      role: 'student', phone: null, status: 1, create_time: ts('2026-10-05 09:12:00'), update_time: ts('2026-10-05 09:12:00'), is_deleted: 0 },
      { id: 5, username: 'student03', password: 'e10adc3949ba59abbe56e057f20f883e', real_name: '王五',      role: 'student', phone: null, status: 0, create_time: ts('2026-10-05 09:12:00'), update_time: ts('2026-10-05 09:12:00'), is_deleted: 0 }
    ],

    /* ---------------- exam_question_bank ----------------
       题库 1 = online_exam.sql 原始题库（4 道种子题：1、2、3 + 简答题）
       题库 2 = Java 基础综合题库，本次演示的全部 34 道题（合计 100 分）
    ------------------------------------------------- */
    exam_question_bank: [
      { id: 1, bank_name: 'Java基础期末题库', subject: 'Java程序设计', description: '大一期末Java考试专用题库（online_exam.sql 原始题库）', create_time: ts('2026-10-02 22:01:53'), update_time: ts('2026-10-02 22:01:53'), is_deleted: 0 },
      { id: 2, bank_name: 'Java基础综合题库', subject: 'Java程序设计', description: 'Java基础期末统考题库：单选16 + 多选6 + 判断9 + 简答3，合计100分', create_time: ts('2026-10-03 10:20:00'), update_time: ts('2026-10-03 10:20:00'), is_deleted: 0 }
    ],

    /* ---------------- exam_question ----------------
       question_type: 1-单选 2-多选 3-判断 4-简答
       answer: 单选 A/B/C/D；多选 AB/ACD；判断 对/错；简答 参考答案
       题库 2 分值合计：16×2 + 6×4 + 9×2 + 8+8+10 = 32 + 24 + 18 + 26 = 100
    ------------------------------------------------- */
    exam_question: [
      /* ---------- 单选题 16 题 × 2 分 = 32 分（题库 2）---------- */
      { id: 1,  bank_id: 2, question_type: 1, question_content: 'Java语言的创始人是？',
        option_a: '比尔盖茨', option_b: '詹姆斯·高斯林', option_c: '乔布斯', option_d: '扎克伯格',
        answer: 'B', score: 2, analysis: 'Java由Sun公司的詹姆斯·高斯林（James Gosling）主导开发，因此被称为“Java之父”。',
        create_time: ts('2026-10-02 22:01:53'), update_time: ts('2026-10-02 22:01:53'), is_deleted: 0 },
      { id: 10, bank_id: 2, question_type: 1, question_content: '在Java中，用于定义常量的关键字是？',
        option_a: 'static', option_b: 'final', option_c: 'const', option_d: 'abstract',
        answer: 'B', score: 2, analysis: 'final 修饰的变量为常量，赋值后不可修改；const 是Java保留字但不使用。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 11, bank_id: 2, question_type: 1, question_content: 'Java中 int 类型占用多少个字节？',
        option_a: '2', option_b: '4', option_c: '8', option_d: '16',
        answer: 'B', score: 2, analysis: 'Java的int固定为4字节（32位），取值范围 -2^31 ~ 2^31-1，与平台无关。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 12, bank_id: 2, question_type: 1, question_content: '下列哪个是Java中正确的 main 方法签名？',
        option_a: 'public void main(String args)', option_b: 'public static void main(String[] args)', option_c: 'static public main(String[] args)', option_d: 'public static main(String[] args)',
        answer: 'B', score: 2, analysis: 'JVM 入口方法必须是 public static void main(String[] args)，顺序不能缺少返回类型。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 13, bank_id: 2, question_type: 1, question_content: 'Java中用于继承的关键字是？',
        option_a: 'implements', option_b: 'extends', option_c: 'inherits', option_d: 'super',
        answer: 'B', score: 2, analysis: '类继承使用 extends，接口实现使用 implements。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 14, bank_id: 2, question_type: 1, question_content: 'String 对象的长度通过哪个方法获取？',
        option_a: 'size()', option_b: 'length()', option_c: 'length', option_d: 'count()',
        answer: 'B', score: 2, analysis: 'String 使用 length() 方法；数组用的是 length 属性；集合用 size()。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 15, bank_id: 2, question_type: 1, question_content: '以下哪个关键字用于抛出异常？',
        option_a: 'throws', option_b: 'throw', option_c: 'catch', option_d: 'final',
        answer: 'B', score: 2, analysis: 'throw 用于在方法体内抛出一个异常对象；throws 用于在方法声明处声明可能抛出的异常。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 16, bank_id: 2, question_type: 1, question_content: 'Java中所有类的直接或间接父类是？',
        option_a: 'Object', option_b: 'Class', option_c: 'System', option_d: 'Main',
        answer: 'A', score: 2, analysis: 'java.lang.Object 是类层次结构的根类，所有类都直接或间接继承它。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 17, bank_id: 2, question_type: 1, question_content: 'ArrayList 与 LinkedList 相比，随机访问（get）效率的特点是？',
        option_a: 'ArrayList 更高', option_b: 'LinkedList 更高', option_c: '完全相同', option_d: '无法比较',
        answer: 'A', score: 2, analysis: 'ArrayList 底层是数组，支持下标随机访问 O(1)；LinkedList 底层是双向链表，get 需要遍历 O(n)。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 18, bank_id: 2, question_type: 1, question_content: '访问修饰符的可见范围由小到大排列正确的是？',
        option_a: 'private < default < protected < public', option_b: 'private < protected < default < public', option_c: 'default < private < protected < public', option_d: 'protected < private < public < default',
        answer: 'A', score: 2, analysis: '可见范围：private（本类）< 默认（同包）< protected（同包+子类）< public（所有）。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 19, bank_id: 2, question_type: 1, question_content: '接口中的方法在 Java 8 之前默认的修饰符是？',
        option_a: 'public abstract', option_b: 'private', option_c: 'protected', option_d: 'static final',
        answer: 'A', score: 2, analysis: 'Java 8 之前接口方法只能是 public abstract；Java 8 起支持 default 和 static 方法。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 20, bank_id: 2, question_type: 1, question_content: '下列哪种集合允许存储重复元素且有序？',
        option_a: 'HashSet', option_b: 'TreeSet', option_c: 'ArrayList', option_d: 'HashMap的keySet',
        answer: 'C', score: 2, analysis: 'List（ArrayList/LinkedList）有序且允许重复；Set 系列不允许重复。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 21, bank_id: 2, question_type: 1, question_content: 'StringBuilder 相对于 String 的主要优势是？',
        option_a: '线程安全', option_b: '拼接时不会频繁创建新对象', option_c: '可以直接比较内容', option_d: '支持下标访问',
        answer: 'B', score: 2, analysis: 'String 不可变，每次拼接都会产生新对象；StringBuilder 在同一个可变字符数组上追加，效率更高。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 22, bank_id: 2, question_type: 1, question_content: '异常处理中，无论是否发生异常都会执行的代码块是？',
        option_a: 'try', option_b: 'catch', option_c: 'finally', option_d: 'throws',
        answer: 'C', score: 2, analysis: 'finally 块用于释放资源，除 System.exit 等极端情况外总会执行。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 23, bank_id: 2, question_type: 1, question_content: '下列哪个不是 Java 的基本数据类型？',
        option_a: 'boolean', option_b: 'char', option_c: 'String', option_d: 'double',
        answer: 'C', score: 2, analysis: 'Java 8 种基本类型：byte、short、int、long、float、double、char、boolean；String 是引用类型。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },
      { id: 24, bank_id: 2, question_type: 1, question_content: 'Java 源文件编译后生成的字节码文件扩展名是？',
        option_a: '.java', option_b: '.class', option_c: '.jar', option_d: '.exe',
        answer: 'B', score: 2, analysis: 'javac 将 .java 源文件编译为 .class 字节码，由 JVM 加载执行。',
        create_time: ts('2026-10-03 10:25:00'), update_time: ts('2026-10-03 10:25:00'), is_deleted: 0 },

      /* ---------- 多选题 6 题 × 4 分 = 24 分 ---------- */
      { id: 25, bank_id: 2, question_type: 2, question_content: '下列属于 Java 面向对象三大特性的有？',
        option_a: '封装', option_b: '继承', option_c: '多态', option_d: '编译',
        answer: 'ABC', score: 4, analysis: '面向对象三大特性为封装、继承、多态；编译是程序构建过程而非特性。',
        create_time: ts('2026-10-03 10:30:00'), update_time: ts('2026-10-03 10:30:00'), is_deleted: 0 },
      { id: 26, bank_id: 2, question_type: 2, question_content: '关于 Java 集合框架，说法正确的有？',
        option_a: 'List 有序且允许重复', option_b: 'Set 不允许重复元素', option_c: 'Map 以键值对形式存储', option_d: 'Collection 是 Map 的子接口',
        answer: 'ABC', score: 4, analysis: 'Map 与 Collection 是并列的两套体系，Map 并不是 Collection 的子接口。',
        create_time: ts('2026-10-03 10:30:00'), update_time: ts('2026-10-03 10:30:00'), is_deleted: 0 },
      { id: 27, bank_id: 2, question_type: 2, question_content: '下列属于 Java 基本数据类型的有？',
        option_a: 'int', option_b: 'boolean', option_c: 'String', option_d: 'char',
        answer: 'ABD', score: 4, analysis: 'String 属于引用类型，其余均为基本数据类型。',
        create_time: ts('2026-10-03 10:30:00'), update_time: ts('2026-10-03 10:30:00'), is_deleted: 0 },
      { id: 28, bank_id: 2, question_type: 2, question_content: '关于方法重载（Overload），说法正确的有？',
        option_a: '方法名相同', option_b: '参数列表不同', option_c: '与返回值类型无关', option_d: '必须发生在同一个类中',
        answer: 'ABCD', score: 4, analysis: '重载要求同类中方法名相同、参数列表（个数/类型/顺序）不同，与返回值无关。',
        create_time: ts('2026-10-03 10:30:00'), update_time: ts('2026-10-03 10:30:00'), is_deleted: 0 },
      { id: 29, bank_id: 2, question_type: 2, question_content: '关于异常的叙述，正确的有？',
        option_a: 'Exception 是 Throwable 的子类', option_b: 'RuntimeException 属于非受检异常', option_c: 'finally 块总会执行', option_d: 'try 块可以没有 catch 也没有 finally',
        answer: 'ABC', score: 4, analysis: 'try 必须至少搭配一个 catch 或 finally；其余说法正确。',
        create_time: ts('2026-10-03 10:30:00'), update_time: ts('2026-10-03 10:30:00'), is_deleted: 0 },
      { id: 30, bank_id: 2, question_type: 2, question_content: '下列哪些关键字可以修饰类？',
        option_a: 'final', option_b: 'abstract', option_c: 'static', option_d: 'public',
        answer: 'ABD', score: 4, analysis: '类可以被 final、abstract、public 修饰；static 只能修饰成员（内部类除外，此处不作考量）。',
        create_time: ts('2026-10-03 10:30:00'), update_time: ts('2026-10-03 10:30:00'), is_deleted: 0 },

      /* ---------- 判断题 9 题 × 2 分 = 18 分（题库 2，answer 存“对/错”） ---------- */
      { id: 2, bank_id: 2, question_type: 3, question_content: 'Java 是一种面向对象的编程语言。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '对', score: 2, analysis: 'Java 三大特性：封装、继承、多态。',
        create_time: ts('2026-10-02 22:01:53'), update_time: ts('2026-10-02 22:01:53'), is_deleted: 0 },
      { id: 31, bank_id: 2, question_type: 3, question_content: 'String 是可变对象，可以通过方法修改其内容。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '错', score: 2, analysis: 'String 是不可变对象，任何“修改”都会生成新的 String 对象。',
        create_time: ts('2026-10-03 10:35:00'), update_time: ts('2026-10-03 10:35:00'), is_deleted: 0 },
      { id: 32, bank_id: 2, question_type: 3, question_content: '构造方法的方法名必须与类名相同，并且没有返回值类型。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '对', score: 2, analysis: '构造方法名与类名相同，不写返回值类型（连 void 也不能写）。',
        create_time: ts('2026-10-03 10:35:00'), update_time: ts('2026-10-03 10:35:00'), is_deleted: 0 },
      { id: 33, bank_id: 2, question_type: 3, question_content: '方法重载要求方法的返回值类型必须不同。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '错', score: 2, analysis: '重载只与参数列表有关，返回值类型不同不构成重载。',
        create_time: ts('2026-10-03 10:35:00'), update_time: ts('2026-10-03 10:35:00'), is_deleted: 0 },
      { id: 34, bank_id: 2, question_type: 3, question_content: 'Java 支持类的多继承，一个类可以同时 extends 多个父类。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '错', score: 2, analysis: 'Java 类只支持单继承，但接口可以多实现。',
        create_time: ts('2026-10-03 10:35:00'), update_time: ts('2026-10-03 10:35:00'), is_deleted: 0 },
      { id: 35, bank_id: 2, question_type: 3, question_content: 'JDK 中包含 JRE，JRE 中包含 JVM。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '对', score: 2, analysis: '包含关系：JDK ⊃ JRE ⊃ JVM。',
        create_time: ts('2026-10-03 10:35:00'), update_time: ts('2026-10-03 10:35:00'), is_deleted: 0 },
      { id: 36, bank_id: 2, question_type: 3, question_content: '接口中的变量默认是 public static final 的。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '对', score: 2, analysis: '接口中的成员变量默认即 public static final 常量。',
        create_time: ts('2026-10-03 10:35:00'), update_time: ts('2026-10-03 10:35:00'), is_deleted: 0 },
      { id: 37, bank_id: 2, question_type: 3, question_content: 'Java 中的数组一旦创建，其长度就不可改变。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '对', score: 2, analysis: '数组长度固定（length 属性为 final），需要动态长度请使用集合。',
        create_time: ts('2026-10-03 10:35:00'), update_time: ts('2026-10-03 10:35:00'), is_deleted: 0 },
      { id: 38, bank_id: 2, question_type: 3, question_content: 'RuntimeException 及其子类属于受检异常，必须显式处理。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '错', score: 2, analysis: 'RuntimeException 及其子类是非受检异常，编译器不强制要求 try-catch 或 throws。',
        create_time: ts('2026-10-03 10:35:00'), update_time: ts('2026-10-03 10:35:00'), is_deleted: 0 },

      /* ---------- 简答题 3 题 = 8 + 8 + 10 = 26 分（题库 2） ---------- */
      { id: 3, bank_id: 2, question_type: 4, question_content: '请简述 Java 面向对象的三大特性。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: '封装：把数据和操作数据的方法封装在类中，通过访问修饰符隐藏内部实现细节，只对外暴露必要的接口；继承：子类通过 extends 复用父类的属性和方法，提高代码复用性，Java 中类为单继承；多态：同一引用在不同情况下表现出不同行为，分为编译期（重载）和运行期（重写+向上转型）多态。',
        score: 8, analysis: '参考答案：封装、继承、多态。答出三个特性名称各得 2 分，每项能举例说明再得若干分。',
        create_time: ts('2026-10-02 22:01:53'), update_time: ts('2026-10-02 22:01:53'), is_deleted: 0 },
      { id: 39, bank_id: 2, question_type: 4, question_content: '请简述 Java 的异常处理机制（try-catch-finally 与 throws 的作用）。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: 'Java 使用 try 块包裹可能抛出异常的代码，catch 捕获并处理特定类型的异常，finally 块无论是否发生异常都会执行，通常用于释放资源；throws 写在方法声明处，用于把异常交给调用者处理。异常体系以 Throwable 为根，分为 Error 和 Exception，Exception 又分受检异常与非受检异常（RuntimeException）。',
        score: 8, analysis: '参考答案：try 监控代码、catch 捕获处理、finally 释放资源、throws 声明抛出。答出 4 个要点各得 2 分。',
        create_time: ts('2026-10-03 10:40:00'), update_time: ts('2026-10-03 10:40:00'), is_deleted: 0 },
      { id: 40, bank_id: 2, question_type: 4, question_content: '请比较 List、Set、Map 三种集合的特点，并各举一个实现类。',
        option_a: null, option_b: null, option_c: null, option_d: null,
        answer: 'List 有序、可重复、支持下标访问，实现类如 ArrayList、LinkedList；Set 无序（HashSet）或不重复，不允许重复元素，实现类如 HashSet、TreeSet；Map 以键值对存储，键唯一，实现类如 HashMap、TreeMap。List 和 Set 属于 Collection 体系，Map 与 Collection 并列。',
        score: 10, analysis: '参考答案：List 有序可重复（ArrayList）、Set 无序不可重复（HashSet）、Map 键值对键唯一（HashMap）。每种集合特点 2 分、实现类 1 分，体系说明 1 分。',
        create_time: ts('2026-10-03 10:40:00'), update_time: ts('2026-10-03 10:40:00'), is_deleted: 0 },

      /* ---------- 题库 1 保留 1 道自命题（用于演示“题库分值 < 卷面总分”的提示） ---------- */
      { id: 41, bank_id: 1, question_type: 1, question_content: '下列哪个关键字用于定义接口？',
        option_a: 'class', option_b: 'interface', option_c: 'enum', option_d: 'struct',
        answer: 'B', score: 5, analysis: 'Java 使用 interface 定义接口；class 定义类，enum 定义枚举。',
        create_time: ts('2026-10-07 09:30:00'), update_time: ts('2026-10-07 09:30:00'), is_deleted: 0 }
    ],

    /* ---------------- exam_paper ----------------
       说明：online_exam.sql 原记录为 id=1、paper_name=''、bank_id=0、
       total_score=100、duration=90、status=0（草稿）。此处补全为一份
       正式发布试卷：题库 2 共 34 题、合计正好 100 分，与 total_score=100 匹配。
       为便于演示“同一份试卷”的完整流程，试卷 2 也设为已发布并共用题库 2。
       exam_start_time / exam_end_time 为补充列，用于计算考试状态；
       下面试卷 1、2 进行中，试卷 3 已结束，试卷 4 未开始。
    ------------------------------------------------- */
    exam_paper: [
      /* 正在进行的考试：已开考且尚未截止 */
      { id: 1, paper_name: 'Java基础期末考试试卷', bank_id: 2, total_score: 100, duration: 90, status: 1,
        exam_start_time: makeTime(-1, 8, 0), exam_end_time: makeTime(6, 22, 0),
        create_time: ts('2026-10-02 21:29:56'), update_time: ts('2026-10-06 15:10:00'), is_deleted: 0 },
      /* 已发布第二场：与试卷 1 共用题库 2，时长 60 分钟，用于反复演示完整流程 */
      { id: 2, paper_name: 'Java进阶随堂测验', bank_id: 2, total_score: 100, duration: 60, status: 1,
        exam_start_time: makeTime(-1, 8, 0), exam_end_time: makeTime(6, 22, 0),
        create_time: ts('2026-10-04 09:00:00'), update_time: ts('2026-10-06 15:10:00'), is_deleted: 0 },
      /* 已结束的考试：截止时间已过（用于演示“已结束”状态与成绩查询） */
      { id: 3, paper_name: 'Java基础随堂小测（已结束）', bank_id: 1, total_score: 100, duration: 20, status: 1,
        exam_start_time: makeTime(-3, 14, 0), exam_end_time: makeTime(-1, 23, 59),
        create_time: ts('2026-10-05 11:20:00'), update_time: ts('2026-10-05 11:20:00'), is_deleted: 0 },
      /* 未开始的考试：开考时间在未来（用于演示“未开始”状态与倒计时提示） */
      { id: 4, paper_name: 'Java基础期中模拟测试（未开始）', bank_id: 2, total_score: 100, duration: 60, status: 1,
        exam_start_time: makeTime(3, 9, 0), exam_end_time: makeTime(3, 11, 0),
        create_time: ts('2026-10-06 16:40:00'), update_time: ts('2026-10-06 16:40:00'), is_deleted: 0 }
    ],

    /* ---------------- exam_record（补充表） ----------------
       status: 0-进行中 1-已提交(待评阅) 2-已评阅
       submit_type: 1-手动交卷 2-超时自动交卷 3-超时未交（作废）
       统计字段：tab_switch_count 切屏次数，report_count 违规上报次数
       下面 id=1 为一条完整的历史成绩（试卷 1，34 题，满分 100）：
         客观题 58 分（单选 26/32 + 多选 18/24 + 判断 14/18）+ 主观题 12/26 = 70 分
    ------------------------------------------------- */
    exam_record: [
      { id: 1, paper_id: 1, user_id: 3, score: 70, objective_score: 58, subjective_score: 12,
        total_score: 100, duration: 90, used_seconds: 2874, start_time: ts('2026-10-08 14:00:00'),
        submit_time: ts('2026-10-08 14:47:54'), status: 2, submit_type: 1,
        tab_switch_count: 1, report_count: 1, is_deleted: 0,
        create_time: ts('2026-10-08 14:00:00'), update_time: ts('2026-10-08 14:47:54') }
    ],

    /* ---------------- exam_record_answer（补充表） ----------------
       is_correct: 1-正确 0-错误 -1-主观题（机器预评分/待评阅）
       与 exam_record.id=1 一一对应，34 题全部落库，成绩单可逐题还原：
         单选 13/16 题正确          -> 26 分（满分 32；第 1 题未作答，18、24 题答错）
         多选 4 题满分 + 1 题漏选   -> 18 分（满分 24；26 题漏选得 2，29 题错选得 0）
         判断 7/9 题正确            -> 14 分（满分 18；31、38 题答错）
         简答 7 + 3 + 2             -> 12 分（满分 26，均附教师评语）
         客观 26+18+14 = 58，主观 12，合计 70 分
    ------------------------------------------------- */
    exam_record_answer: [
      /* ---- 单选题 ---- */
      { id: 1,  record_id: 1, question_id: 1,  user_answer: '', is_correct: 0, score: 0, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 2,  record_id: 1, question_id: 10, user_answer: 'B', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 3,  record_id: 1, question_id: 11, user_answer: 'B', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 4,  record_id: 1, question_id: 12, user_answer: 'B', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 5,  record_id: 1, question_id: 13, user_answer: 'B', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 6,  record_id: 1, question_id: 14, user_answer: 'B', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 7,  record_id: 1, question_id: 15, user_answer: 'B', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 8,  record_id: 1, question_id: 16, user_answer: 'A', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 9,  record_id: 1, question_id: 17, user_answer: 'A', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 10, record_id: 1, question_id: 18, user_answer: 'C', is_correct: 0, score: 0, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 11, record_id: 1, question_id: 19, user_answer: 'A', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 12, record_id: 1, question_id: 20, user_answer: 'C', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 13, record_id: 1, question_id: 21, user_answer: 'B', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 14, record_id: 1, question_id: 22, user_answer: 'C', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 15, record_id: 1, question_id: 23, user_answer: 'C', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 16, record_id: 1, question_id: 24, user_answer: 'D', is_correct: 0, score: 0, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      /* ---- 多选题（漏选得一半分） ---- */
      { id: 17, record_id: 1, question_id: 25, user_answer: 'ABC', is_correct: 1, score: 4, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 18, record_id: 1, question_id: 26, user_answer: 'AB', is_correct: 0, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 19, record_id: 1, question_id: 27, user_answer: 'ABD', is_correct: 1, score: 4, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 20, record_id: 1, question_id: 28, user_answer: 'ABCD', is_correct: 1, score: 4, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 21, record_id: 1, question_id: 29, user_answer: 'ACD', is_correct: 0, score: 0, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 22, record_id: 1, question_id: 30, user_answer: 'ABD', is_correct: 1, score: 4, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      /* ---- 判断题 ---- */
      { id: 23, record_id: 1, question_id: 2,  user_answer: '对', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 24, record_id: 1, question_id: 31, user_answer: '对', is_correct: 0, score: 0, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 25, record_id: 1, question_id: 32, user_answer: '对', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 26, record_id: 1, question_id: 33, user_answer: '错', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 27, record_id: 1, question_id: 34, user_answer: '错', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 28, record_id: 1, question_id: 35, user_answer: '对', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 29, record_id: 1, question_id: 36, user_answer: '对', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 30, record_id: 1, question_id: 37, user_answer: '对', is_correct: 1, score: 2, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      { id: 31, record_id: 1, question_id: 38, user_answer: '对', is_correct: 0, score: 0, teacher_comment: null, create_time: ts('2026-10-08 14:47:54') },
      /* ---- 简答题（教师评阅结果） ---- */
      { id: 32, record_id: 1, question_id: 3,
        user_answer: '封装是把属性和方法包装在类里，隐藏实现细节；继承是子类复用父类的属性和方法，关键字是 extends；多态是同一个方法在不同对象上有不同的表现。',
        is_correct: -1, score: 7, teacher_comment: '三个特性都答到了，但多态部分未区分编译期与运行期，扣 1 分。',
        create_time: ts('2026-10-08 14:47:54') },
      { id: 33, record_id: 1, question_id: 39,
        user_answer: '把可能出错的代码放在 try 里，用 catch 捕获异常，finally 里的代码一定会执行。',
        is_correct: -1, score: 3, teacher_comment: '只答出 try-catch-finally，遗漏 throws 与异常体系分类。',
        create_time: ts('2026-10-08 14:47:54') },
      { id: 34, record_id: 1, question_id: 40,
        user_answer: 'List 有序可重复，常用 ArrayList；Set 不允许重复元素，常用 HashSet；Map 以键值对存储，键唯一，常用 HashMap。',
        is_correct: -1, score: 2, teacher_comment: '要点基本齐全，但未说明 List/Set 属于 Collection 体系、Map 与其并列，扣分较多。',
        create_time: ts('2026-10-08 14:47:54') }
    ],

    /* 自增主键游标，模拟 MySQL AUTO_INCREMENT */
    sequences: {
      exam_record: 2,
      exam_record_answer: 35,
      exam_question: 42
    }
  };

  /* 判断题数据库里存“对/错”，页面上用“正确/错误”呈现 */
  DB.QUESTION_TYPE_LABEL = { 1: '单选题', 2: '多选题', 3: '判断题', 4: '简答题' };
  DB.QUESTION_TYPE_TAG = { 1: 'tag-single', 2: 'tag-multi', 3: 'tag-judge', 4: 'tag-essay' };
  DB.RECORD_STATUS_LABEL = { 0: '进行中', 1: '已提交', 2: '已评阅' };

  /* ============================================================
   * 初始化浏览器的“考试记录表”
   * ------------------------------------------------------------
   * 真实项目中 exam_record / exam_record_answer 由后端数据库提供；
   * 本演示用 localStorage 模拟这两张表，因此首次打开页面时需要把
   * mock 数据里的种子记录（张三那条 76 分历史成绩）写入其中，
   * 否则“我的考试记录 / 查看答卷”将会是空的。
   * force = true 时先清空再写入（供“清空本机考试缓存”使用）。
   * ============================================================ */
  var LS_RECORD = 'online_exam.records';
  var LS_ANSWER = 'online_exam.answers';

  /* 判断某个“表”是否还没有数据（key 不存在，或存在但为空数组） */
  function isEmptyStore(key) {
    var raw = localStorage.getItem(key);
    if (!raw) { return true; }
    try {
      var rows = JSON.parse(raw);
      return !rows || !rows.length;
    } catch (e) {
      return true;
    }
  }

  DB.seedStores = function (force) {
    try {
      if (force) {
        localStorage.removeItem(LS_RECORD);
        localStorage.removeItem(LS_ANSWER);
      }
      if (isEmptyStore(LS_RECORD)) {
        localStorage.setItem(LS_RECORD, JSON.stringify(DB.exam_record));
      }
      if (isEmptyStore(LS_ANSWER)) {
        localStorage.setItem(LS_ANSWER, JSON.stringify(DB.exam_record_answer));
      }
      return true;
    } catch (e) {
      /* 隐私模式 / 禁用存储时静默降级：页面仍可作答，只是不落库 */
      return false;
    }
  };

  DB.seedStores(false);   // 首次加载即写入种子记录

  global.MockDB = DB;
})(window);
