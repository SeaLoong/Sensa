import React,{useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Tab,Tabs,Typography,useMediaQuery} from '@mui/material';

const topics=[
  {title:'开始使用',steps:['先添加输出设备并填写连接信息。连接本身不会移动设备。','在轴配置中限制允许行程、速度和方向，先用小范围验证。','选择手动、OSC 或脚本输入，点击“应用输入方式”。切换页签只浏览界面。','确认映射与预览后，才打开输入开关。输入关闭、急停和断开各有独立状态。'],note:'停止输出后需要重新启用输入；解除急停不会自动恢复运动。'},
  {title:'OSC 与 Unity',steps:['普通 SPS 用户先选择相应参数预设；FT 默认隐藏，可在参数工作台打开。','需要定位时，在 Unity Avatar 根添加 Automatic SPS Setup；选择 Socket/Plug 和需要的能力。','每组默认只选择一个 Sensa 测量目标，初始 Off。Sensa 选择菜单独立于 SPS 本身开关。','标准 Root 只有位置诊断；本地点/PB 是四接收器；配对三点姿态需要对方安装匹配标记。','在“空间诊断”检查有效性和采样。多来源时在参数工作台固定使用来源。'],note:'Shader 曲线仍是实验路径；世界 Udon 测试不能代替头像上传或实际 PCVR 验证。'},
  {title:'校准与映射',steps:['进入 OSC 的“量程校准”子页，选择本地点/PB 和 X/Y/Z/距原点。','把目标移到期望的 0% 位置并采集，再到 100% 位置采集。PB 采样时需保持抓取。','确认方向与百分比预览，生成草稿。小于 1 mm 的量程、无效采样或混合来源不会用于校准。','回到“参数与映射”，检查目标轴、输入范围和映射范围，点击保存并应用映射。','草稿、预览和校准都不会自动启用输出。普通单侧 SPS 根部诊断不提供行程校准。'],note:'输入范围描述 OSC/局部测量；映射范围描述逻辑目标；每个输出的轴配置还会进一步限制实际发送值。'},
  {title:'输出与排错',steps:['每个输出卡显示自己的最近发送目标，而不是全局输入。TCode 为 0–999；Intiface 为设备位置/震动百分比。','数值表示本地传输或 API 已接受的命令，不证明设备已经到位。UDP 没有远端确认；Intiface 位置方向可能与 L0 相反。','没有数值：检查输出是否启用、连接、输入开关、门控和定位有效性。连接后尚未发送时保持空白。','OSC 有值却不动：检查是否应用了 OSC 输入、是否保存映射、来源是否唯一、精确定位是否有效。','输入超时默认关闭；只有持续发送的来源才应设置断流停止，静止的增量 OSC 可能不发包。'],note:'断开或停止后页面不会把旧目标冒充当前位置；日志用于查看发送异常。'},
];
export default function HelpDialog({open,onClose}){
  const [topic,setTopic]=useState(0);const narrow=useMediaQuery('(max-width:600px)');
  return <Dialog open={open} onClose={onClose} fullScreen={narrow} fullWidth maxWidth="md"><DialogTitle>使用帮助</DialogTitle><DialogContent dividers>
    <Tabs value={topic} onChange={(_,next)=>setTopic(next)} variant="scrollable" allowScrollButtonsMobile aria-label="帮助主题">{topics.map((item,i)=><Tab key={item.title} label={item.title} id={`help-tab-${i}`} aria-controls={`help-panel-${i}`}/>)}</Tabs>
    <Box role="tabpanel" id={`help-panel-${topic}`} aria-labelledby={`help-tab-${topic}`} sx={{pt:2}}><Typography variant="h6">{topics[topic].title}</Typography><Box component="ol" className="help-steps">{topics[topic].steps.map(step=><Typography component="li" key={step}>{step}</Typography>)}</Box><Alert severity="info">{topics[topic].note}</Alert></Box>
  </DialogContent><DialogActions><Button onClick={onClose}>关闭帮助</Button></DialogActions></Dialog>;
}
