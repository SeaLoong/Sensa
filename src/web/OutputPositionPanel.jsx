import { t, getLocale, diagnostic, docUrl } from './i18n.js';
import React from 'react';
import {Box,Chip,LinearProgress,Typography} from '@mui/material';
import {outputPreview} from './output-preview.js';

export default function OutputPositionPanel({state}) {
  const preview=outputPreview(state);
  return <Box className="output-position-panel">
    <Box className="output-position-heading"><Typography variant="subtitle2">{t("输出目标预览")}</Typography><Chip size="small" variant="outlined" label={preview.label} color={preview.phase==='error'?'error':preview.phase==='sent'?'success':'default'}/></Box>
    {preview.targets.length===0?<Typography variant="body2" color="text.secondary" sx={{my:1}}>{t("尚无可显示的发送目标。连接不会自动移动设备。")}</Typography>:<Box className="output-position-axes">{preview.targets.map(target=><Box key={target.key} className="output-position-axis">
      <Box className="output-position-heading"><Typography variant="caption" title={diagnostic(target.label)}>{diagnostic(target.label)}</Typography><Typography variant="caption" fontWeight={700}>{target.maximum===999?Math.round(target.value):target.value.toFixed(1)+'%'} <span className="output-position-unit">/ {target.maximum===999?'999':'100%'}</span></Typography></Box>
      <LinearProgress variant="determinate" value={target.percent} color={preview.phase==='sent'?'primary':'inherit'}/>
    </Box>)}</Box>}
    <Typography variant="caption" color="text.secondary" component="p" sx={{mt:1}}>{t("显示该输出最近发送的目标值，已包含输出侧映射；不是设备位置传感器回读。")}{preview.lastSentAtUtc&&<span data-testid="output-last-sent">{t(" 最近发送 {0}", [new Date(preview.lastSentAtUtc).toLocaleTimeString(getLocale())])}</span>}</Typography>
  </Box>;
}
