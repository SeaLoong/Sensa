import { t, getLocale, diagnostic, docUrl } from './i18n.js';
import React from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { oscWorkflowHints } from './osc-workflow.js';

export default function OscFlowStatus(props) {
  const hints = oscWorkflowHints(props);
  return <Box className="dialog-panel" aria-label={t("Avatar 世界 软件联动检查")}>
    <Typography variant="subtitle2" sx={{mb:1}}>{t("联动检查 · 先看接收值，再看运行目标")}</Typography>
    {hints.map(hint => <Alert key={hint.key} severity={hint.severity} sx={{mb:1,overflowWrap:'anywhere'}}>{hint.text}</Alert>)}
    {!hints.length && <Alert severity="success">{t("OSC 输入已开启，映射已保存。请继续对照实际接收值和运行目标；此状态不证明设备已到位。")}</Alert>}
    <Typography variant="caption" component="a" href={docUrl("docs/lab-workflow.md")} target="_blank" rel="noreferrer">{t("测试 Avatar、世界和 Sensa 的完整联动步骤")}</Typography>
  </Box>;
}
