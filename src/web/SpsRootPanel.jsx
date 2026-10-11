import React, { useState } from 'react';
import { Alert, Box, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';

export default function SpsRootPanel({ observations = [] }) {
  const [selected, setSelected] = useState('');
  const root = observations.find(p => p.key === selected) || observations[0];
  const cm = value => (value * 100).toFixed(1);
  return <Box className="dialog-panel pose-panel">
    <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap">
      <Typography variant="subtitle1" fontWeight={700}>单侧 SPS 根部定位</Typography>
      <Chip size="small" label="对方无需 Sensa · 实验性诊断" variant="outlined" />
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>自己安装 SensaSpsRootProbe，对方保留标准 TPS_Pen_Root 球形触点即可。测量相对根部位置，不能据此还原尖端、倾角、扭转或插入比例。</Typography>
    {!root ? <Alert severity="info">等待 8 路采样：Sensa/SpsRoot/v1/实例/Self 或 Others/Root/A0…A7。纯 DPS、无触点或关闭交互的头像可能没有可用信号。</Alert> : <>
      <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 230 }}><InputLabel id="sps-root-label">根部观测</InputLabel><Select labelId="sps-root-label" label="根部观测" value={root.key} onChange={e => setSelected(e.target.value)}>{observations.map(p => <MenuItem value={p.key} key={p.key}>{p.instance} · {p.party} · {p.sourceLabel}</MenuItem>)}</Select></FormControl>
        <Chip size="small" color={root.valid ? 'success' : 'warning'} label={root.reason} />
        <Chip size="small" label={`${root.sampleCount}/8 采样`} />
      </Stack>
      <Box className="pose-metrics" sx={{ my: 1 }}>
        {[
          ['根部 X / Y / Z', root.valid ? `${cm(root.position.x)} / ${cm(root.position.y)} / ${cm(root.position.z)} cm` : '—'],
          ['根部横向距离', root.valid ? `${cm(Math.hypot(root.position.x, root.position.y))} cm` : '—'],
          ['球形拟合残差', root.valid ? `${(root.residual * 1000).toFixed(2)} mm` : '—'],
          ['尖端 / 姿态 / 行程', '不可观测'],
        ].map(([label, value]) => <Box className="pose-metric" key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700}>{value}</Typography></Box>)}
      </Box>
      <Typography variant="caption" color="text.secondary">数值为探针局部坐标，Z 正方向由安装方向决定。残差不等于实际误差；多个同标签目标可能混入。本面板不生成运动映射，也不会接管现有输出。</Typography>
    </>}
  </Box>;
}
