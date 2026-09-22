# Changelog

All notable changes to this project are documented in this file.

## [1.2.38] - 2026-09-22

### Changed

- 隐藏玩家排行榜的统计不完整提示，保留原有计算口径；悬停或键盘聚焦玩家姓名时，联动高亮其在四个排行榜中的整行，并支持移开、失焦和页面刷新后清除。同步浏览器交互验证与锁文件版本。

## [1.2.37] - 2026-09-22

### Changed

- 生活与战斗贡献榜改为按具备参试资格的在会周数平均，确认缺席计零；保存入会时间证据，未知历史标注不完整，手动导入记录完全排除。合并榜继续直接相加两类均值。

## [1.2.36] - 2026-09-22

### Changed

- 玩家合并榜改为生活与战斗平均相对人均直接相加，不再平均；同步合计标题、统计说明和缺失值回归测试。

## [1.2.35] - 2026-09-22

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.2.34] - 2026-09-22

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.2.33] - 2026-09-22

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.2.32] - 2026-09-22

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.2.31] - 2026-09-22

### Changed

- 完善成员列表字段设置与侧栏名称自定义，修正设置持久化并同步界面测试。

## [1.2.30] - 2026-09-22

### Changed

- 完善检查工作流、浏览器矩阵审计和发布门禁文档。

## [1.2.29] - 2026-09-22

### Changed

- 补充发布检查工作流与浏览器审计参数的回归测试。

## [1.2.28] - 2026-09-22

### Changed

- 优化玩家资料技能方格与试炼表格自适应布局，完善开发服务器测试接口和响应式审计。

## [1.2.27] - 2026-09-22

### Changed

- 修正玩家历史资料与试炼数据缓存、展示和状态同步，并补充回归测试。

## [1.2.26] - 2026-09-21

### Changed

- 优化按玩家查看：增加可搜索玩家名单、切换入口与资料缓存，并完善窄屏布局和回归测试。

## [1.2.25] - 2026-09-21

### Changed

- 新增按玩家查看模式，支持选择玩家、查看生活与战斗历史横向记录，并保留完整成员数据。

## [1.2.24] - 2026-09-21

### Changed

- 新增历史试炼玩家内嵌资料视图，支持跨周项目与周次跳转，并复用原生资料查询与缓存。

## [1.2.23] - 2026-09-21

### Changed

- 增强历史试炼成员交互：点击玩家姓名调用游戏原生资料入口，并补充不可用提示与回归测试。

## [1.2.22] - 2026-09-21

### Changed

- 整理公会助手说明与元信息，增强历史试炼跨周成员高亮和身份匹配。

## [1.2.21] - 2026-09-21

### Changed

- 优化历史试炼项目排序与成员明细展示，按游戏顺序排列项目并稳定排序生活项目。

## [1.2.20] - 2026-09-21

### Changed

- 增强历史试炼成员状态与报名等级记录，补充原生图标展示、名单同步及回归测试。

## [1.2.19] - 2026-09-21

### Changed

- 优化试炼历史选择器与说明文案，增强键盘操作和横向滚动体验，并同步测试夹具。

## [1.2.18] - 2026-09-21

### Changed

- 优化原始试炼历史页面的显示、文案与样式，补充开发文档说明。

## [1.2.17] - 2026-09-21

### Changed

- 移除试炼历史的自动分析与评分，仅保留按周和按项目的原始数据查看；保留导入导出能力并新增分析功能恢复指南。

## [1.2.16] - 2026-09-21

### Changed

- 优化公会建设与试炼分析界面、建筑数据和双语展示，补充测试台验证。

## [1.2.15] - 2026-09-20

### Changed

- 完善公会点数来源识别与状态同步，优化建设页界面样式、游戏状态兼容和相关回归测试。

## [Unreleased]

### Fixed

- 修复本周试炼点数被公会剩余余额覆盖的问题；只接受明确的本周点数，保留真实零值，拒绝空值与迟到旧周数据。
- 跨周时不再沿用旧周点数；旧版本的本周缓存重新读取，保留余额、历史周记录和施工计划。

## [1.2.14] - 2026-09-18

### Changed

- 优化试炼历史视图的成员信息显示与相关双语文案。

## [1.2.13] - 2026-09-18

### Changed

- 完善试炼分析与历史页面设置、存储迁移和界面交互，补充测试台与回归验证。

## [1.2.12] - 2026-09-18

### Changed

- 新增公会试炼历史分析视图与统计指标，整合建设页入口，完善双语界面、测试台和回归测试。

## [1.2.11] - 2026-09-18

### Changed

- 完善公会试炼历史的导入导出、存储兼容与界面展示，修正构建入口并补充回归测试。

## [1.2.10] - 2026-09-18

### Changed

- 新增独立公会试炼历史视图与历史数据迁移，完善中英文文案、样式、测试台和回归测试。

## [1.2.9] - 2026-09-18

### Changed

- 新增只读历史试炼页：被动保存已完成生活与战斗试炼统计，按公会、角色和服务器隔离持久化，支持双语查看与 JSON 导出，并补充桥接、存储和响应式审计。

## [1.2.8] - 2026-09-18

### Changed

- 整合公会点数与建设预算，支持确认后覆盖游戏追踪周数据并随时恢复；优化当前周展示、未来预算设置和相关无障碍交互。

## [1.2.7] - 2026-09-18

### Changed

- 修正公会试炼首期日期并迁移旧版周记录，固定建设页页签滚动时的顶部显示，并补充存储迁移与界面回归测试。

## [1.2.6] - 2026-09-17

### Changed

- 完善公会建设页的预测预算与 ETA 交互、补充中英文提示和测试台验证。

## [1.2.5] - 2026-09-17

### Changed

- 完善公会点数预测回看与建设规划预算：排除未完成周样本，支持 2–12 周预测窗口和 0–12 周规划周期，并在历史数据冲突时停止预测。

## [Unreleased]

### Changed

- 游戏追踪到的已结束公会试炼周现可在插件内确认警告后手工覆盖；原追踪值保留且可随时恢复。
- 公会周点数预测不再将本周的 0 或部分进度当作完整周；历史合计与游戏累计值冲突时停止预测和 ETA。
- 新增 2–12 周预测回看窗口与 0–12 周建设规划周期，可将未来预测点数纳入只读施工预算。
- 公会点数历史表改用“第 N 周（日期）”标识，并在最上方新增只读的当前周记录；本周尚未开始时显示历史预测并明确标注来源。
- 预测回看周数和规划周数改用与信用点数量相同的数字步进控件，支持点击、长按和键盘输入。

## [1.2.4] - 2026-09-12

### Changed

- 修复公会点数历史录入，并改为整表直接填写与批量保存

## [1.2.3] - 2026-09-12

### Changed

- Added persistent manual guild-point history entry and automatic filling for missing trial weeks, with source-aware forecasts and CSV export.

## [1.2.2] - 2026-09-09

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.2.1] - 2026-09-09

### Changed

- 新增公会点数周记录、增长率与下周预测，并根据施工缺口显示预计完成周数；支持导出周记录 CSV 和二次确认重置。

## [1.2.0] - 2026-09-03

### Changed

- Removed native sidebar tab drag reordering and its persisted order while retaining wheel-only horizontal overflow scrolling.

## [1.1.69] - 2026-09-03

### Changed

- Added wheel scrolling, drag-and-drop reordering, and persistent ordering for overflowing native sidebar tabs.

## [1.1.68] - 2026-09-02

### Changed

- 公会建筑未读取到等级时统一按 0 级规划，并移除手工起始等级填写流程。

## [1.1.67] - 2026-08-26

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.1.66] - 2026-08-19

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.1.65] - 2026-08-19

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.1.64] - 2026-08-19

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.1.63] - 2026-08-19

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.1.62] - 2026-08-19

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.1.61] - 2026-08-19

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.1.60] - 2026-08-19

### Changed

- Released the current verified source changes and regenerated userscript bundles.

## [1.1.59] - 2026-08-19

### Changed

- Restored compact single-row credit tables across three-column layouts and kept optimal exchange recommendations visible during guild-token guidance.

## [1.1.58] - 2026-08-18

### Changed

- Improved guided exchange planning, responsive three-column credit cards, copyable guidance text, and 10M price-limit stepping.

## [1.1.57] - 2026-08-18

### Changed

- 将硬编码的高价物品名称屏蔽改为可持久化的单件市场价上限，并完善兑换数量指引文案与布局。

## [1.1.56] - 2026-08-18

### Changed

- Moved the planned exchange quantity reminder below the recommendation card and added one-time inventory-capped quantity prefilling.

## [1.1.55] - 2026-08-18

### Changed

- 取消空神龛计划的隐式默认填充；清空、删除最后一项或失效计划被移除后，刷新页面仍保持为空，并提供明确的中英文空状态引导。

## [1.1.54] - 2026-08-18

### Changed

- Improved Chinese item-name localization by merging official runtime sources, Webpack locale resources, visible game UI names, and cached fallbacks.

## [1.1.53] - 2026-08-18

### Changed

- 将‘屏蔽贤者物品’升级为‘屏蔽超高价格物品’，统一工具栏控件高度，并同时排除贤者物品、大师护符和宗师护符；兼容旧设置。

## [1.1.52] - 2026-08-17

### Changed

- Improved the exchange quantity guide, ignored highest bids below the official tradable range, and added a persisted Sage-item filter.

## [1.1.51] - 2026-08-17

### Changed

- 适配游戏新版双数量输入框，仅在右侧目标获得字段显示神龛高亮指引，并补充英文 Userscript 元数据与相应回归测试。

## [1.1.50] - 2026-08-12

### Changed

- 修复进入游戏后信用侧栏页签延迟出现的问题：改为侧栏 DOM 就绪后事件驱动挂载，并保留低频恢复检查。

## [1.1.49] - 2026-08-12

### Changed

- 修复中文游戏界面启动时插件误用英文的问题，恢复官方中文物品名称的延迟重试；同时修复插件遮挡游戏原生侧栏宽度拖拽条的问题。

## [1.1.48] - 2026-08-11

### Changed

- Added persistent settings for excluding individual life or combat shrine buffs from batch fill, hiding the Guild Construction view without deleting plans, and preserving accessible focus and responsive tab ordering.

## [1.1.47] - 2026-08-11

### Fixed

- Treated buildings omitted from a complete guild-building snapshot as known level 0 while preserving unknown levels for partial live frames and preferring current-session values over older initialization data.
- Extended shrine guidance for guild-token credit exchanges to highlight the native Guild Token item, distinguish exchange batches from token counts, focus the quantity step after selection, and suppress conflicting market-item advice.

### Verified

- Added unit and browser coverage for complete versus partial building snapshots, non-1:1 guild-token conversions, native exchange guidance, and the documented 320px to 1200px construction width matrix.

## [1.1.46] - 2026-08-11

### Changed

- Rebuilt Guild Construction into a queue-first planner with a responsive official-icon building picker, persistent whole-building drag ordering, inline unknown-level capture, per-building budget status, collapsible steps, clear undo, and robust focus restoration.

## [1.1.45] - 2026-08-10

### Fixed

- Restored guild-building and shrine icons in the compact construction catalog by resolving the current game sprite from its same-origin asset manifest and defining an explicit SVG viewport.
- Added a visible vector fallback so unavailable game assets no longer leave empty building tiles.

### Verified

- Replaced the self-seeded sprite reference in the browser harness with an asset-manifest fixture and verified all 28 icon references across the documented 320px to 1200px construction width matrix.

## [1.1.44] - 2026-08-10

### Changed

- Made the three internal navigation tabs and construction queue draggable with persistent ordering, rebuilt the guild construction catalog as a compact responsive square-tile grid, and clarified live guild-building level status while removing internal rule-snapshot copy.

## [1.1.43] - 2026-08-10

### Added

- Added the game's native SVG icons to all 23 guild buildings and 5 shrines in the construction catalog without bundling duplicate image files.
- Added a category-colored fallback marker when the game sprite source is temporarily unavailable.

### Verified

- Confirmed the live game maps all 28 building HRIDs to the official `misc_sprite` symbols.
- Added symbol-mapping coverage and responsive browser audits at 320px and 666px with all 28 icon references present and no overflow or control overlap.

## [1.1.42] - 2026-08-10

### Changed

- Rebuilt Guild Construction as a compact administrator workspace with a budget command deck, dense searchable building catalog, planned-building emphasis, and a responsive catalog/queue split view.
- Budget and search input now update their relevant preview in place, preserving input focus instead of rebuilding the whole construction view.
- Refined shrine exchange quantity guidance into an inline row that distinguishes the remaining plan total from the amount to enter in the current exchange and avoids covering unrelated controls.

### Verified

- Added construction source contracts and browser audits for Chinese and English layouts at 320px, 420px, 666px, and 900px, covering overflow, overlap, search focus, queue steps, and the budget cutoff.
- Added shrine guidance coverage for selected-item mismatches, inline placement, topmost-input checks, and the revised quantity labels.

## [1.1.41] - 2026-08-10

### Changed

- Redesigned the shrine guide quantity prompt as a compact input popover that emphasizes the suggested batch count, removes duplicate normal-state totals, and only shows total versus per-exchange limits when necessary.

## [1.1.40] - 2026-08-10

### Added

- Added a live quantity ticket beside the native guild exchange input while shrine guidance is active, showing the exact batch count to enter without modifying the game input.
- When the remaining requirement exceeds the native per-exchange maximum, the ticket shows both the suggested amount for this exchange and the total batches still required.

### Changed

- Quantity guidance now follows the native input while scrolling or resizing and is removed immediately when the exchange modal closes or guidance moves to another step.

### Verified

- Added state coverage for native exchange limits and source integration checks for tooltip anchoring, cleanup, accessibility, and modal removal.

## [1.1.39] - 2026-08-10

### Changed

- Remembered the last open Guild Assistant view across page refreshes and browser restarts, covering Shrine Upgrade, Credit Value, and Guild Construction.
- Restored the saved tab selection, matching content visibility, and view-specific data refresh while safely falling back to Credit Value for missing or invalid legacy state.

### Verified

- Added source integration coverage for saving, validating, restoring, and refreshing all three internal views.

## [1.1.38] - 2026-08-10

### Added

- Added an optional read-only shrine planning guide that highlights every outstanding guild credit, the recommended exchange item, the required exchange batch input, and the matching life or combat shrine.
- Added a deterministic guide state module with explicit loading, unavailable, blocked, completion, market-item, and guild-token routes.

### Changed

- Shrine guidance now advances from live inventory and personal shrine-level revisions while ignoring duplicate level snapshots.
- Native-game highlighting uses item and shrine HRIDs as stable identifiers, limits observation to relevant guild and modal surfaces, and respects reduced-motion preferences.

### Verified

- Added focused state-transition, bridge-revision, bundle-integration, persistence, and accessibility wiring tests.

## [1.1.37] - 2026-08-10

### Added

- Added a read-only Guild Construction workspace for presidents and administrators, covering all 23 ordinary guild buildings and 5 shrines through level 20.
- Added per-character saved targets, manual guild-point budgets, reorderable step-by-step construction queues, a visible over-budget cutoff, clipboard copy, and CSV export.
- Added a deterministic guild-building rule module and a responsive construction audit fixture with live building-level samples.
- Ordinary development builds now preserve an existing versioned historical bundle; the release workflow explicitly opts in when creating the new release archive.

### Safety

- Construction planning never performs upgrades or guesses the guild's available points; administrators provide the budget manually when no reliable live balance is exposed.

## [1.1.33] - 2026-08-01

### Changed

- Made Shrine Upgrades the default view when the guild assistant is first opened.
- Redesigned Credit Value with the shrine planner's compact visual system: a unified control toolbar, denser guild-token overview, color-coded exchange cards, at-a-glance best costs, and a narrow-layout metric grid.
- Preserved unchanged credit-result markup during refreshes to avoid unnecessary visual rebuilding.

### Verified

- Browser-tested the default view and the complete Credit Value control cycle in Chinese and English at 320px, 420px, 610px, and 900px without text overflow, boundary escapes, or control overlap.

## [1.1.32] - 2026-08-01

### Fixed

- Prevented periodic live-data refreshes from rebuilding unchanged shrine selectors and result cards, eliminating the recurring planner flicker.
- Removed decorative plan-number circles, route accents, green row highlights, and row-entry animation from the shrine planner.

### Verified

- Added a planner-stability audit that simulates three live inventory revisions and checks that unchanged plan DOM nodes are preserved without mutations or horizontal overflow.

## [1.1.31] - 2026-08-01

### Fixed

- Removed the forced monospace fallback from shrine-plan amounts, percentages, number inputs, and route markers so Chinese labels and numbers use the same system font as the rest of the plugin while retaining tabular numeral alignment.

## [1.1.30] - 2026-08-01

### Changed

- Redesigned the shrine upgrade workspace as a compact connected route, with a calmer preset toolbar, clearer numeric hierarchy, visible keyboard focus, and reduced-motion support.
- Kept four shrine plans on single lines at a 420px sidebar while reserving the two-line layout for narrower panels; widened material totals so five-digit values remain inside their cards.

### Verified

- Extended the responsive harness to report text overflow, child boundary escapes, and interactive-control overlap in addition to whole-panel horizontal overflow.
- Browser-tested dense Chinese and English states from 320px through 900px, including empty/add/remove plan transitions and synchronized token-budget input.

## [1.1.29] - 2026-08-01

### Removed

- Removed the current arbitrary-item exchange lookup UI, dedicated comparison logic, localization strings, and test-harness audit pending a future redesign.

## [1.1.28] - 2026-08-01

### Changed

- Refined the arbitrary-item exchange lookup with a clearer centered layout, stronger focus and hover feedback, animated result cards, and denser responsive metrics.

## [1.1.27] - 2026-08-01

### Added

- Added an arbitrary-item exchange lookup that searches localized names, English names, or item HRIDs and reports the official guild-credit ratio, current market reference, cost per credit, target cost, same-credit ranking, and relative gap from the best item.
- Items that exist in game data but cannot be exchanged, ambiguous searches, missing items, and missing market quotes now have distinct, explicit states.

### Changed

- Reordered the internal tabs so Shrine Upgrade appears before Credit Value while preserving Credit Value as the default open view.
- Added compact responsive query cards that remain free of horizontal overflow from 288px to 868px of tested panel width.

## [1.1.26] - 2026-08-01

### Fixed

- The ordinary remove button can now delete the final shrine-upgrade plan without the planner immediately recreating a default row.

## [1.1.25] - 2026-08-01

### Added

- Added a live percentage indicator and visible 20%, 40%, 50%, 60%, 80%, and 100% reference marks to the automatic guild-token budget slider.

### Changed

- Pointer dragging now magnetically settles near each reference percentage while number and keyboard input remain exact; the responsive budget row also preserves a usable slider width on narrow sidebars.

## [1.1.24] - 2026-08-01

### Added

- Added a repeatable responsive-layout audit mode to the local test harness, covering 11 sidebar widths from 320px to 1200px and reporting actual overflow, row heights, layout bands, and grid states.

### Changed

- Moved the single-line shrine planner down to the 460px sidebar range and the fully inline material rows down to the 610px range.
- Tightened narrow-screen shrine controls, token-budget controls, summaries, and material recommendation rows while preserving zero structural horizontal overflow across the audit matrix.

## [1.1.21] - 2026-08-01

### Added

- Automatically allocates available guild tokens to missing shrine credits from highest to lowest current market exchange value, while keeping the best-item recommendation for any partially covered remainder.
- Added synchronized slider and number inputs for limiting the automatic guild-token budget; the chosen limit is saved between page loads.

### Changed

- Automatic allocations reserve shrine token costs and manually selected credit exchanges first, and skip credit types without a verified market price.

## [1.1.20] - 2026-08-01

### Fixed

- Kept the plugin entry visible when the game switches between wide and narrow character-management layouts by migrating the tab and panel to the currently visible tab container on resize.

## [1.1.19] - 2026-08-01

### Changed

- Hid the all-credit guild-token shortcut so shrine plans are controlled only by each credit card's persistent exchange-mode button.

## [1.1.18] - 2026-08-01

### Added

- Added a persistent exchange-mode button to every shrine-plan credit card, allowing each guild credit to independently use either its best market item or the fixed guild-token exchange.
- The existing all-credit toggle now acts as a select-all shortcut and shows a mixed state when only some credit types use guild tokens.

### Changed

- Mixed shrine plans now combine market-priced items for unselected credits with guild-token requirements for selected credits in one cost summary.

## [1.1.17] - 2026-08-01

### Fixed

- Shrine-plan inventory now follows the game's `endCharacterItems` WebSocket deltas in real time, merging stacks by the native item hash and removing zero-count stacks.
- Visible shrine plans and guild-exchange advice now recalculate after an inventory revision instead of continuing to display the initialization snapshot.

## [1.1.16] - 2026-08-01

### Added

- Added a shrine-planning toggle that converts every missing guild credit through the fixed guild-token exchange rates, merges those tokens into the total requirement and inventory gap, and replaces market-item recommendations with per-credit token exchange details.

## [1.1.15] - 2026-07-31

### Fixed

- Added an isolated-world-safe native market DOM observer as a fallback data channel. Whenever the player opens or refreshes an item market page, it records that item's HRID, enhancement level, full visible ask/bid depth, source, and timestamp even if page-world WebSocket wrapping is unavailable.

## [1.1.14] - 2026-07-31

### Fixed

- The production userscript now explicitly requests Tampermonkey's raw page sandbox before installing its passive WebSocket observer, avoiding isolated-world `unsafeWindow` proxy assignments that do not replace the game's real constructor.
- Added machine-readable bridge diagnostics so live verification can prove which injection path ran and which market item, ask, bid, and timestamp were most recently observed.

## [1.1.13] - 2026-07-31

### Fixed

- The production userscript now requests Tampermonkey's `unsafeWindow` bridge so its passive WebSocket observer is installed in the game page context and can receive native live market order-book updates.

## [1.1.12] - 2026-07-31

### Changed

- Rebuilt the official userscript entry points from the completed live-market reconciliation implementation so distributed builds consistently report version 1.1.12.

## [1.1.11] - 2026-07-26

### Changed

- Reworked live market quote handling around the proven reference-script model: ask and bid updates are tracked independently, official game WebSocket messages remain passive, and current-session quotes continue to override older public snapshots.
- Conflicting public snapshots now defer live-quote eviction once to avoid races with a WebSocket response that arrived during the request.
- Public marketplace snapshots that unexpectedly omit previously confirmed entries must be observed consistently before they can replace complete data.
- Existing v1 live-quote caches are migrated to the new per-field metadata format instead of being discarded.

## [1.1.10] - 2026-07-26

### Fixed

- Live market quotes received from native item market pages are now persisted across page reloads and browser restarts instead of existing only in the current page's memory.
- Persisted quotes retain their public-snapshot baseline, are replaced by the next native order-book update for the same item and level, and are removed only after a genuinely newer public marketplace snapshot supersedes them.
- Invalid or incompatible cached market data is ignored safely without affecting the game.

## [1.1.9] - 2026-07-26

### Changed

- Credit rankings, guild-token values, shrine plans, and every estimated-material card now share the same compact `300px` responsive track width, so every section switches column count at the same available panel width.
- Removed the material-only one-column breakpoints while preserving the compact internal material-card layout for genuinely narrow panels.

## [1.1.8] - 2026-07-26

### Changed

- Market estimates now use the live best ask and bid passively received when the player opens an item's native market page, overriding the older public snapshot for that item.
- Live overrides remain available until the same item's next order-book update or a genuinely newer public marketplace snapshot supersedes them; unchanged or older API responses no longer discard fresher data.

## [1.1.7] - 2026-07-24

### Changed

- The assistant page now uses a transparent outer background, allowing the game's native starfield background to show through while retaining readable inner cards.

## [1.1.6] - 2026-07-22

### Added

- Added a Tampermonkey fallback installer link in the plugin footer and installation documentation for players who cannot open the Greasy Fork script page. Automatic update checks remain on the official release source.

## [1.1.5] - 2026-07-22

### Fixed

- Native market navigation now always passes enhancement level `0` for plugin recommendation materials, matching the game's own inventory flow and preventing an undefined order-book key from crashing the market view.

## [1.1.4] - 2026-07-22

### Changed

- Item icons now use the game's own `Go to Marketplace` controller, so the native market item selection and navigation state are preserved. The previous search-field navigation remains only as a compatibility fallback if the game no longer exposes its controller.

## [1.1.3] - 2026-07-22

### Fixed

- Material recommendation cards now switch to one column in narrow plugin panels, with an additional compact layout for their item, inventory, and best-exchange details.

## [1.1.2] - 2026-07-22

### Changed

- The guild-target shortcut now explicitly reports “current maximum level reached” when the selected life or combat shrines already match their corresponding guild building levels.
- The shrine batch-planning card now uses container-based responsive layout: its description moves above the target buttons in narrow plugin panels, and the buttons stack only when needed.

## [1.1.1] - 2026-07-20

### Fixed

- The exchange advisor now distinguishes a missing public buy price from a one-batch sale budget that is too small to buy any alternative exchange item.

## [1.1.0] - 2026-07-20

### Added

- Full runtime English UI for non-Chinese game locales, including the sidebar tab, credit rankings, shrine planner, market links, update status, material estimates, and exchange-advisor overlay.
- A locale-aware local test harness (`?locale=en`) and tests for English copy, plural quantities, locale formatting, and the absence of hard-coded Chinese UI copy.

### Changed

- Centralized all player-facing text in `src/localization.js`; Chinese remains the default for Chinese game locales and English is used for every other locale.
- Sidebar discovery now recognizes both Chinese and English native tab labels, so the plugin can mount in either official client language.

## [1.0.0] - 2026-07-20

### Added

- MIT License and a stable release-documentation baseline.
- Cached, timeout-protected update checks.
- Explicit release archive policy: versioned `dist` builds are retained in the repository.

### Changed

- Removed the official item-name catalog diagnostic line from the player UI; the catalog remains the sole source for Chinese item names.
- Reworked the exchange-advisor observer: the document only watches modal mount/removal, while live changes are watched only inside the active native exchange modal.
- Updated the README to reflect official i18n name resolution, saved UI state, marketplace links, bulk shrine presets, clear-all planning, and estimation limits.

### Fixed

- Update checking now times out instead of remaining indefinitely in a loading state, and repeated checks within five minutes reuse the same result.

## [0.4.59] - 2026-07-20

- Added the clear-all shrine upgrade plans action.
