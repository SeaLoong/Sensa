import React, { useState } from 'react';
import { Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material';

export default function SpsRootPanel({ observations = [], onUsePoint }) {
  const [selected, setSelected] = useState('');
  const root = observations.find(p => p.key === selected) || observations[0];
  const local = root && ['Point','Handle'].includes(root.kind);
  const cm = value => (value * 100).toFixed(1);
  return <Box className="dialog-panel pose-panel">
    <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap">
      <Typography variant="subtitle1" fontWeight={700}>根部与本地点测量</Typography>
      <Chip size="small" label={local ? '本地骨骼 / PB · 局部坐标' : '单侧 SPS · 诊断'} variant="outlined" />
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>{local ? '读取自己的骨骼或 PB 把手位置；不是对方的完整姿态，也不是 GPU 形变网格。PB 把手仅在抓取时启用。' : '自己安装根部探针，对方保留标准 TPS_Pen_Root 即可。共享阵列一次只测量一个槽位；不能据此还原尖端、倾角、扭转或插入比例。'}</Typography>
    {!root ? <Alert severity="info">等待 8 路阵列采样。Unity 中可使用 Automatic SPS Setup 自动配置，或添加 Local Bone or PB Probe。支持 SpsRoot、SharedRoot、Point、Handle 四种来源；根部诊断不等于完整姿态。</Alert> : <>
      <Stack direction="row" gap={1} alignItems="center" useFlexGap flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 230 }}><InputLabel id="sps-root-label">测量对象</InputLabel><Select labelId="sps-root-label" label="测量对象" value={root.key} onChange={e => setSelected(e.target.value)}>{observations.map(p => <MenuItem value={p.key} key={p.key}>{p.instance} · {p.kind} · {p.party} · {p.sourceLabel}</MenuItem>)}</Select></FormControl>
        <Chip size="small" color={root.valid ? 'success' : 'warning'} label={root.reason} />
        <Chip size="small" label={`${root.sampleCount}/8 采样`} />
        {root.kind === 'SharedRoot' && <Chip size="small" label={`共享槽位 ${root.slot || '停用'}`} />}
        {local && <Button size="small" onClick={()=>onUsePoint?.(root)}>生成 Z 位移映射草稿</Button>}
      </Stack>
      <Box className="pose-metrics" sx={{ my: 1 }}>
        {[
          [local ? '测量点 X / Y / Z' : '根部 X / Y / Z', root.valid ? `${cm(root.position.x)} / ${cm(root.position.y)} / ${cm(root.position.z)} cm` : '—'],
          ['横向距离', root.valid ? `${cm(Math.hypot(root.position.x, root.position.y))} cm` : '—'],
          ['球形拟合残差', root.valid ? `${(root.residual * 1000).toFixed(2)} mm` : '—'],
          [local ? '姿态 / 插入比例' : '尖端 / 姿态 / 行程', '不可观测'],
        ].map(([label, value]) => <Box className="pose-metric" key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700}>{value}</Typography></Box>)}
      </Box>
      <Typography variant="caption" color="text.secondary">数值为探针局部坐标。残差不等于实际误差；多个同标签目标可能混入。{local ? '位移映射需校准，多个目标匹配或失去有效采样时停止输入。' : 'SPS 根部和共享阵列只提供诊断，不生成运动映射。'}</Typography>
    </>}
  </Box>;
}
