# External references

Files in this directory are third-party reference implementations. They are
not build inputs and must not be copied into the project without reviewing
their behavior, provenance, and license.

## Local plugin collection

The visible local-plugins/ directory contains third-party plugins retained as
local reference material. It is deliberately excluded from Git and the release
whitelist, but remains visible in Finder and other file browsers. Its nested
README records the original SHA-256 digests.

## MWI Guild Donation Value

- File: mwi-guild-donation-value-v0.7.6.user.js
- Upstream version: 0.7.6
- Source: Greasy Fork script 586854
- License declared by the userscript: MIT
- Purpose here: compare public market and guild-planning approaches.

The project already has its own market bridge and cache consistency model.
This reference must not introduce a second competing WebSocket or market-state
arbitration path.

## 原生侧栏标签栏重构参考

以下资料于 2026-09-26 查阅，用于理解游戏原生侧栏与多个 userscript 共存的边界。
仅参考交互契约和故障模式，不复制第三方实现，不将参考脚本加入构建。
公开来源可能继续更新；源码核对和本项目夹具测试不等于这些版本已通过真实游戏组合测试。

- 规范：[W3C Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
  约束焦点移动、激活和 tab/tabpanel 的 ARIA 关联；
  [MDN cloneNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode)
  说明克隆会复制属性与 ID，但不复制 `addEventListener` 监听；
  [MDN MutationObserver.observe](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/observe)
  用于限定观察节点、属性与子树范围。
- [MWITools](https://github.com/YangLeda/Userscripts-For-MilkyWayIdle)，许可证
  `CC-BY-NC-SA-4.0`：作者仓库的
  [盈亏模块](https://github.com/YangLeda/Userscripts-For-MilkyWayIdle/blob/main/src/features/asset-history/30-panel.js)
  `mountNative` 深克隆标签，`syncNativeVisibility` 隐藏侧栏的其他分支；
  [规划模块](https://github.com/YangLeda/Userscripts-For-MilkyWayIdle/blob/main/src/features/planning.js)
  `mount` 又可克隆盈亏标签。两者使用 `data-mwitools-character-tab`，因此继承的本方
  `data-*` 不能证明节点归属；原生面板宿主也可能被整个隐藏。
- [学学中秋月饼](https://greasyfork.org/zh-CN/scripts/570078)，许可证 `MIT`：本次直接读取
  [发布脚本](https://update.greasyfork.org/scripts/570078/%E5%AD%A6%E5%AD%A6%E4%B8%AD%E7%A7%8B%E6%9C%88%E9%A5%BC.user.js)
  为 `1.6.231`。标签使用 `data-mooncake-enhancement-tab-button="1"`，深克隆首个按钮，
  并按索引配对已有按钮和面板；未发现本项目的协同事件。不能依赖点击冒泡或统一重排外部标签。
- [MWI Profit Panel II](https://greasyfork.org/en/scripts/572344-mwi-profit-panel-ii)，许可证
  `MIT`：本次直接读取
  [发布脚本](https://update.greasyfork.org/scripts/572344/MWI%20Profit%20Panel%20II.user.js)
  为 `20260906.0.10.85`。`waitForPannels` 新建按钮，`setupTabSwitching` 广播和监听
  `mwi:sidebar-plugin-activated`，其 owner 为 `mwi-profit-panel`；它还显式识别
  `mwi-credit` ID 和 `data-mwi-credit-tab`，这些已是外部兼容契约。
- 邀请助手仅核对当前本地相邻项目
  `../银河奶牛公会邀请助手/src/ui/sidebar-integration.js`，未验证公开仓库源码。
  它在捕获监听中调用 `stopImmediatePropagation()`，并通过同一 document 上的字符串 owner
  事件协调切换；这说明不能只依靠标签栏冒泡监听发现其他插件激活。

本项目保留 `mwi-credit-sidebar-tab`、`mwi-credit-optimizer`、`data-mwi-credit-tab`
及上述字符串 owner 事件。定位与归属、临时 DOM 修改、挂载生命周期分别放在
`src/ui/sidebar-dom.js`、`src/ui/sidebar-interaction.js`、`src/ui/sidebar-integration.js`；
只恢复本方仍持有的临时修改，并在卸载时释放滚轮监听和样式。
维持三秒检查、有效定位缓存三十秒过期；此次边界是原生侧栏接入，不改变助手内部功能标签。
