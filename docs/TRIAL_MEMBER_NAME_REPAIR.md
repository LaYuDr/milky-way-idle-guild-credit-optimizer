# 旧试炼表玩家名字修复

2026-09-22 核对游戏页面上的 16 条历史记录：第 11 周的游戏采集记录中，`tiankongyiran` 的数字角色 ID 为 `315187`，名字正确。同一个数字 ID 在这些游戏采集记录中没有发现不同名字。

异常来自手动导入的 `26.9.04公会试炼伤害占比 - 副本 (1).xlsx` 虫群记录：归档保留的原始 J 列单元格已经含有 `000`，对应名字中的 `k/K`。不是游戏 WebSocket 采集时替换了数字 ID。根据正确的历史名字及当前公会成员名单，确认以下 10 条修正：

| 源行 | 原名             | 修正名         |
| ---- | ---------------- | -------------- |
| 6    | 000wy            | kwy            |
| 11   | BS000            | BSK            |
| 14   | ABCDEFGHIJ000MLN | ABCDEFGHIJKMLN |
| 19   | BigBa000a        | BigBaKa        |
| 29   | catcoo000ie      | catcookie      |
| 32   | tian000ongyiran  | tiankongyiran  |
| 35   | 000aela          | Kaela          |
| 37   | su000hoiwham     | sukhoiwham     |
| 42   | Ryuu000u2        | Ryuuku2        |
| 47   | 000ali000uno     | kalikuno       |

## 修复边界与恢复

`src/trial-history.js` 的 `normalizeSnapshot` 调用 `repairLegacyMemberNames`。只接受手动 schema 2 虫群记录，并同时核对以下来源信息：

- recordId：`7b1591d8-9b9c-5aaf-9552-39dcebea9277`
- sourceSha256：`f85b3a0c18ad9217bae121da5eeba254922f4907fa7a683a752f99025f68f1e8`
- 指定的 `excel-row-N`、原名和对应 `sourceCells.JN.value`，且角色 ID 必须为 `null`。

不会全局替换 `000`、模糊合并名字或为手动记录补造数字 ID；未匹配来源、已被用户编辑或无法确认身份的记录保持原样。

读取已有浏览器档案、导入预览、正式导入和导出重导入使用同一规则。读取不回写浏览器原始数据。归一化结果保留源单元格及全部统计数值，并在修正成员的 `nameCorrection` 中保留 `originalName` 和修复原因。重复处理无额外变化；旧文件与修正文件不会因此产生重复记录。

如需恢复原名，可在导出副本中将这些成员的 `name` 恢复为 `nameCorrection.originalName`。旧版本读取浏览器中未被回写的原始档案也仍能获得原名。修正规则仍启用时，重新导入满足上述条件的原始副本会再次修正。

## 验证

`test/trial-member-names.test.js` 覆盖全部 10 个名字、严格来源限制、未知名字不替换、原始字段不变、幂等、已有存储读取、导入预览去重、导出往返和按玩家历史关联。开发时另以本地原始合并导出文件核对，确认只改 10 个名字，所有成员统计行保持一致。
