# 历史试炼分析功能存档与恢复指南

存档日期：2026-09-21。状态：已从当前运行代码移除，本文仅记录旧实现，供以后选择性恢复。

用户认为这些分析缺乏实际用途，要求全部清理。移除的是六项衍生分析及其筛选、导航、图表、折叠状态读写；历史记录、被动采集、成员原始明细、原始 JSON、导入与导出仍保留。没有删除浏览器中的历史记录，也没有迁移或清空旧的分析界面偏好。

这里的“分析”是本地 JavaScript 规则计算与渲染。旧实现没有调用 AI 模型或上传试炼数据。本文记录已有做法，不代表建议照搬所有功能或认可其实际价值。

## 可恢复的准确源码版本

删除前已提交的完整基线：`69c42ec1b0c6092049728dadeb5258d659200a0a`，提交标题 `Release v1.2.16`。本次开始时下列受版本管理文件没有未提交修改，因此该提交能准确取回被移除的源码和测试。

在仓库根目录可先查看旧实现：

```bash
git show 69c42ec1b0c6092049728dadeb5258d659200a0a:src/trial-analytics.js
git show 69c42ec1b0c6092049728dadeb5258d659200a0a:src/ui/trial-analytics-view.js
git show 69c42ec1b0c6092049728dadeb5258d659200a0a:test/trial-analytics.test.js
```

需要同时查看旧版集成文件时，先提取到独立临时目录，不覆盖当前工作区：

```bash
restore_ref=69c42ec1b0c6092049728dadeb5258d659200a0a
restore_dir="$(mktemp -d /tmp/mwi-trial-analytics-restore.XXXXXX)"
git archive "$restore_ref" \
  src/trial-analytics.js src/ui/trial-analytics-view.js \
  src/ui/trial-history-view.js src/trial-history.js \
  src/userscript.js src/runtime/config.js src/runtime/storage.js \
  src/ui/styles.js src/localization.js tools/build.js tools/test-harness.html \
  test/trial-analytics.test.js test/runtime-modules.test.js \
  README.md docs/DEVELOPMENT.md \
  | tar -x -C "$restore_dir"
printf '%s\n' "$restore_dir"
```

这些命令要求本地 Git 包含该提交；浅克隆或仅下载源码压缩包时，需要先取得包含这个提交的仓库历史。不要整库回退，也不要用旧版 `userscript.js`、`storage.js` 或 `styles.js` 覆盖今后的新版本；应按下文列出的接入点合并。

## 原有六项功能

| 分区 ID      | 功能           | 旧实现做法                                                                                                                                         |
| ------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overview`   | 单次试炼概览   | 显示记录人数、已知数值合计、人均值、中位数；战斗额外列出三种指标合计。缺失指标时提示已知人数。                                                     |
| `ranking`    | 成员贡献排行   | 按所选指标降序排列，支持前十或全部；显示并列名次、数值、占比、相对最大值的条形与前五贡献占比；点击姓名进入成员历史。                               |
| `comparison` | 同项目跨周对比 | 限同一公会范围、同一项目，选择起始周；支持各周全部成员或各周共同成员，比较人数、总量、人均值、中位数。两周为条形，多周为折线，附数值表与首尾变化。 |
| `member`     | 成员历史表现   | 按身份查找逐次记录，展示各指标、名次、占比与相对此前同项目的变化；趋势图只取当前项目、截至所选周且周次不冲突的数据。                               |
| `coverage`   | 成员记录分布   | 成员 × 记录矩阵，区分有贡献、明确为零、数值未知、无记录；每页 20 名成员、8 份记录，可分页并打开成员历史。                                          |
| `scatter`    | 战斗贡献分布   | 横轴为伤害，纵轴可选治疗或减伤前承伤；只画两轴均已知的成员。点可悬停或键盘聚焦查看详情，点击进入成员历史；生活试炼显示不适用说明。                 |

公共控件包括公会范围、试炼项目、周次/记录、指标、成员搜索、统计口径说明和六区导航。搜索忽略大小写、按姓名子串匹配，只筛选排行、矩阵和散点；不会改变原始排名或占比分母。

## 输入数据与计算口径

分析输入是历史模块已经校验过的 `records` 与当前 `selected` 记录，不自行请求统计。关键字段包括 `key`、`schemaVersion`、`source`、`guildId`、`guildName`、`weekStartAt`、`kind`、`trialHrid`、`rows`、`members`。旧分析没有新增历史记录格式。

- 生活指标：`workDone`；战斗指标：`damageDealt`、`healingDone`、`premitigatedDamageTaken`。两类不混算，不生成综合战力或出勤评分。
- `metricValue(record, row, field)`：官方 schema 1 的省略字段按零处理；明确 `null`、手动记录的缺失值、负数、非有限数字、非数字返回未知。展示未知用 `—`。
- `summary(entries, field)`：记录人数包含所有成员；已知人数只计有效数值。总量、人均值和中位数只按已知数值计算，没有已知值时均为 `null`。前五占比是最大五个已知值之和除以总量，总量为零时不计算。
- `ranking(entries, field)`：数值降序，未知排末尾，同值按姓名排列。采用竞赛排名，例如 `1, 1, 3`；未知没有名次。占比为成员数值除以该次全体已知值总量，搜索与前十截取发生在排名计算之后。
- `change(before, after)`：已知首尾值才算绝对变化；百分比仅在基期大于零时计算 `(after - before) / before`，不把零基期显示为无穷增长。
- 图表显示值通常最多两位小数、百分比一位小数，坐标轴使用紧凑数字；这只是分析显示格式，原始记录及导出保持完整精度。

`metricValue` 在本次清理中移至 `src/trial-history.js` 并由原始明细表继续使用。以后恢复分析应复用它或保持完全相同的语义，避免出现两套不一致的零值处理。

注意：上述未知值规则是读取与显示的容错语义，不代表 JSON 导入允许缺少指标。基线 `parseImport` 对手动记录要求该项目各指标均为非负有限数字；只有官方 schema 1 可省略零值字段。若以后要支持不完整的手动统计，应另行修改导入契约并补充测试。

## 公会与成员身份关联

`scopeKey(record)` 有公会 ID 时使用 `['guild', String(guildId)]`；没有 ID 时使用 `['manual', guildName || null]`，再 JSON 序列化为键。已知公会 ID 与手动公会名称不自动合并；未注明公会的手动记录同组，旧界面会提示只有确实来自同一公会时比较才有意义。

`entries(record)` 先统计该记录中的姓名出现次数，再确定身份：

1. 有角色 ID 时按 ID 关联，改名仍延续同一身份。
2. 无 ID、姓名非空、在该记录中唯一且不是“前成员”或“former member”时，按完全相同的姓名关联；大小写不同也不合并，并显示“同名匹配”。
3. 其他情况使用记录键及成员键隔离，只在本条记录内成立。

最终身份键包含公会范围与匹配类型。旧实现不做模糊姓名纠错，也不自动合并“只有名字”和“已有 ID”的两个身份。`members(records)` 按周次遍历并按身份去重，再按姓名排序供选择器和矩阵使用。

## 时间线、共同成员与缺失状态

- `timeline(records, selected)` 只选同一范围、同一项目、有周次、且不晚于当前所选周的记录。没有所选周次时返回空时间线。
- 同周多份同项目记录不累加：非当前周有歧义就排除并计数提示；当前周以用户明确选择的记录消除歧义。
- `comparison(..., mode, start)` 在起始周至所选周范围内计算。共同成员模式先取所有入选周身份集合的交集，再计算各周指标；缺失的周不补零，也不凭空生成记录。
- `memberHistory` 保留不同项目的成员逐次明细；该项目不支持当前指标时改用该项目的首个指标。表格变化只与此前同项目比较，周次未知、非递增或同周多份记录时不计算变化。
- `coverage` 首先判断有无该成员记录；存在时，任一相关指标大于零即为有贡献，否则只要有未知指标就是未知，全部已知且为零才是零。无记录不等于缺席。
- 两周条形与多周 SVG 折线均有数据表/文字补充。折线按实际时间定位横轴，未知值处分段，不把缺失值连成零值趋势。

## 模块与恢复接入点

| 文件                               | 旧职责与需要恢复的部分                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/trial-analytics.js`           | 纯函数模块，导出 `fields`、`scopeKey`、`metricValue`、`entries`、`summary`、`ranking`、`scoped`、`timeline`、`comparison`、`change`、`members`、`memberHistory`、`coverage`；浏览器全局名 `MwiGuildTrialAnalytics`，Node 下支持 `module.exports`。 |
| `src/ui/trial-analytics-view.js`   | `createTrialAnalyticsView` 返回 `render(records, selected)` 与 `bind(host)`；全局名 `MwiGuildTrialAnalyticsView`。只管派生显示和交互，不写历史数据。                                                                                               |
| `src/ui/trial-history-view.js`     | 创建分析视图，传入 API、翻译、HTML 转义、项目名/日期格式化、折叠偏好和选择记录回调；`refresh` 在原始明细前插入分析输出；`bind` 一次性绑定父容器事件。                                                                                              |
| `src/userscript.js`                | 读取两个浏览器全局模块，加入启动依赖检查，并向历史视图注入 `analyticsApi`、`analyticsViewApi`。                                                                                                                                                    |
| `src/runtime/config.js`            | 恢复 `TRIAL_ANALYTICS_UI_STORAGE_KEY` 和 `TRIAL_ANALYTICS_SECTIONS` 两项常量。                                                                                                                                                                     |
| `src/runtime/storage.js`           | 恢复并导出 `loadTrialAnalysisCollapsed`、`saveTrialAnalysisCollapsed` 及内部合法分区过滤函数。                                                                                                                                                     |
| `src/localization.js`              | 恢复中文与英文全部 `analysis*` 键；不能只恢复中文，否则英文页面会暴露键名。                                                                                                                                                                        |
| `src/ui/styles.js`                 | 恢复 `.mwi-analysis-*`、`.mwi-trial-analytics`、`[data-analysis-collapse-status]` 样式及容器查询。保留现有原始表格和试炼主题共享样式，避免重复添加。                                                                                               |
| `tools/build.js`                   | 将两个分析模块重新加入显式 `SOURCE_FILES`，遵循基线顺序且在 `src/userscript.js` 前加载。                                                                                                                                                           |
| `test/runtime-modules.test.js`     | 恢复显式模块清单断言。                                                                                                                                                                                                                             |
| `test/trial-analytics.test.js`     | 恢复五组纯函数回归测试和合成记录工厂；新增需求应扩展测试而不是仅恢复旧结果。                                                                                                                                                                       |
| `tools/test-harness.html`          | 恢复 `runTrialAnalyticsAudit`、`trialAnalyticsAudit` 查询入口与完成信号，同时更新当前“无分析控件”断言以适应恢复范围。                                                                                                                              |
| `README.md`、`docs/DEVELOPMENT.md` | 按实际恢复范围重新说明功能和验收步骤，不把本存档描述当作当前产品功能。                                                                                                                                                                             |

典型注入接口，具体合并以当时源码为准：

```js
const analytics = analyticsViewApi.createTrialAnalyticsView({
  api: analyticsApi,
  t,
  escapeHtml,
  trialName,
  recordDate,
  collapsedSections: pluginStorage.loadTrialAnalysisCollapsed(),
  onCollapsedChange: pluginStorage.saveTrialAnalysisCollapsed,
  onSelectRecord(key) {
    selectedKey = key;
    refresh(getPanel());
  }
});
// refresh 内，仅在有 selected 时：
markup += analytics.render(records, selected);
// bind 内，只绑定一次父容器：
analytics.bind(host);
```

## 界面状态与交互实现

旧视图的内存状态默认为 `metric: 'workDone'`、`query: ''`、`limit: '10'`、`cohort: 'all'`、`measure: 'total'`、`start: ''`、`member: ''`、`y: 'healingDone'`、`memberPage: 0`、`recordPage: 0`。切换项目时如果指标不适用，会改用该项目首个指标。筛选状态没有全部持久化，只有折叠分区写入独立偏好。

偏好键为 `mwi-trial-analytics-ui-v1:${guildBuildingPlannerStorageKey()}`，作用域跟随站点和角色。值是去重后的合法分区 ID 数组，合法值为 `overview`、`ranking`、`comparison`、`member`、`coverage`、`scatter`。加载异常返回空数组；保存失败返回 `false`，当页折叠仍有效并显示提示。本次移除不主动删除这个旧键。

分区标题是原生按钮，保持 `aria-expanded` 与 `aria-controls`；收起区域使用 `hidden`，不会继续参与键盘焦点导航。顶部导航和成员跳转会先展开目标区域，再按页签高度设置滚动留白并移动焦点。

事件委托绑定在历史页父容器，重绘时不重复注册。搜索使用 `compositionstart`/`compositionend` 避免中文输入法组合期间重绘输入框；重绘后恢复相应控件焦点及可适用的选区。散点同时支持鼠标提示和键盘聚焦详情。

旧版样式沿用试炼页靛蓝主题、14px 正文、16px 标题、12px 辅助文字。筛选默认三列，试炼容器不超过 460px 时改两列；概览默认四列，最近容器不超过 650px 时改两列。试炼容器至少 1100px 时排行与对比并排，其余分区整行。分析表格在自身区域滚动、最大高 360px；折线图最小宽 640px。恢复时应重新验证实际宽度，不应认为这些旧断点天然适合未来界面。

## 恢复顺序与验证

1. 明确这次真正需要恢复的分区；可以只恢复纯函数或某一项功能，不必重新装回六区。
2. 提取上述基线源码，核对现有数据模型与接口变化。只将需要的独立模块恢复到源码目录，对共享文件按接入点合并。
3. 先恢复并运行计算测试，再接入界面、双语文案、样式、构建清单及存储偏好。原始明细继续使用历史模块的 `metricValue`。
4. 恢复或按范围调整浏览器审计，再运行下列完整检查。生成文件通过构建产生，不手改 `dist/`，不修改 `releases/` 历史归档。

```bash
node --test test/trial-analytics.test.js test/trial-history.test.js
npm run check
git diff --check
npm run release:dry-run
```

旧分析审计地址（只有恢复测试台入口后才可使用）：

```text
http://127.0.0.1:4173/test-harness.html?trialAnalyticsAudit=1&resetState=1&sidebarWidth=900
```

等待 `window.__mwiTrialAnalyticsAuditReady`，要求所有 `checks` 都为 `true`。合成数据包含三周生活记录及一份战斗记录，覆盖六区显示、三周折线、共同成员、零值/无记录、搜索及中文输入法、成员历史、单周空图状态、战斗指标切换、散点聚焦、导航、独立折叠、偏好保存、自动展开与原始记录不变。

纯函数重点示例：`[10, 10, 0, null]` 应为人数 4、已知 3、合计 20、人均 `20 / 3`、中位数 10、名次 `[1, 1, 3, null]`、占比 `[0.5, 0.5, 0, null]`。另需验证 ID 改名延续、重名隔离、公会隔离、歧义周排除、共同成员交集、零基期与无记录不补零。

浏览器至少运行中文宽度 `320, 360, 420, 460, 480, 520, 560, 610, 720, 900, 1200`，英文 `320, 610, 900`；同时跑 `trialHistoryAudit` 和开发指南的布局矩阵。恢复旧宽屏双列时额外观察 1500px，并记录实际面板宽度。检查零页面横向溢出、局部表格滚动、焦点可见和折叠后的可达性。

最后验证导出 JSON、刷新后恢复、重复导入/冲突跳过，确保分析恢复不改变原始记录。没有新授权时不要提交、推送或发布；实际发布沿用项目受保护发布流程。
