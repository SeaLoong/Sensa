import React from 'react';
import { t, docUrl } from './i18n.js';
import { Button, Modal } from './ui.tsx';

export default function HelpDialog({ open, onClose, onNavigate, emergencyAction, error }) {
  return (
    <Modal open={open} emergencyAction={emergencyAction} error={error} title={t('使用帮助')} wide
      onClose={onClose} actions={<Button onClick={onClose}>{t('关闭帮助')}</Button>}>
      <p className="help-intro">{t('Sensa 将输入信号转换成设备动作、应用参数或录制文件。从下面选择一件想做的事，完成配置后回到控制页启用输入。')}</p>
      <div className="usage-choices">
        <div>
          <div><h3>{t('先试一次手动控制')}</h3><p className="caption muted">{t('连接输出后，用滑块选择位置并发送一次。确认方向和行程后，可以连续发送或播放 funscript。')}</p></div>
          <div className="actions">{onNavigate && <><Button onClick={() => onNavigate('manual')}>{t('打开手动')}</Button><Button onClick={() => onNavigate('script')}>{t('打开脚本')}</Button></>}</div>
        </div>
        <div>
          <div><h3>{t('用 VRChat 参数驱动动作')}</h3><p className="caption muted">{t('在 OSC 页选择来源和预设，将接触深度、距离或速度映射到输出。参数详情提供含义、量程和官方资料。')}</p></div>
          <div className="actions">{onNavigate && <Button onClick={() => onNavigate('osc')}>{t('配置 OGB')}</Button>}<a href={docUrl('docs/osc-parameters.md')} target="_blank" rel="noreferrer">{t('参数说明')}</a></div>
        </div>
        <div>
          <div><h3>{t('组合或计算多个信号')}</h3><p className="caption muted">{t('把多个参数做加权平均、范围转换或平滑处理。保存为一个计算信号后，可同时提供给多个输出。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('pipeline')}>{t('编辑信号流程')}</Button>}
        </div>
        <div>
          <div><h3>{t('连接设备、应用或录制')}</h3><p className="caption muted">{t('选择输出类型后填写连接地址和信号来源。可以连接体感设备、写回 VRChat OSC，或把结果保存成 funscript。')}</p></div>
          <div className="actions">{onNavigate && <><Button onClick={() => onNavigate('outputs')}>{t('配置输出')}</Button><Button onClick={() => onNavigate('recording')}>{t('录制动作')}</Button></>}</div>
        </div>
        <div>
          <div><h3>{t('读取 SPS 根点的位置')}</h3><p className="caption muted">{t('在 Unity 中安装 SPS 四点定位或 Contact 直接定位组件，再选择 Socket 或 Plug。根点面板会显示位置，Contact 方案还可读取相对速度。')}</p></div>
          <div className="actions">{onNavigate && <Button onClick={() => onNavigate('sensa-sps')}>{t('查看根点')}</Button>}<a href={docUrl('docs/contact-sdk.md')} target="_blank" rel="noreferrer">{t('Contact SDK 设置')}</a></div>
        </div>
        <div>
          <div><h3>{t('从画面读取位置和方向')}</h3><p className="caption muted">{t('Shader 将根点的位置、方向和 Avatar 缩放写入黑白图块。按捕获指南设置 Unity 画面和桌面读取区域，桥接程序会将结果送入 Sensa。')}</p></div>
          <a href={docUrl('unity/top.sealoong.sensa/GPU-TRACKING.md')} target="_blank" rel="noreferrer">{t('捕获设置')}</a>
        </div>
      </div>
      <div className="help-links">
        <a href={docUrl('docs/usage-scenarios.md')} target="_blank" rel="noreferrer">{t('使用方案')}</a>
        <a href={docUrl('docs/guide.md')} target="_blank" rel="noreferrer">{t('使用指南')}</a>
        <a href={docUrl('unity/top.sealoong.sensa/README.md')} target="_blank" rel="noreferrer">{t('Unity 指南')}</a>
      </div>
    </Modal>
  );
}
