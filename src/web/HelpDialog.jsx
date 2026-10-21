import React from 'react';
import { t, docUrl } from './i18n.js';
import { Button, Modal } from './ui.jsx';

export default function HelpDialog({ open, onClose, onNavigate, emergencyAction, error }) {
  return (
    <Modal open={open} emergencyAction={emergencyAction} error={error} title={t('使用帮助')}
      onClose={onClose} actions={<Button onClick={onClose}>{t('关闭帮助')}</Button>}>
      <div className="usage-choices">
        <div>
          <div><strong>OGB / SPS</strong><p className="caption muted">{t('Avatar 已配置 OGB 或 SPS？从收到的接触参数开始，选择目标后校准动作范围。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('osc')}>{t('配置 OGB')}</Button>}
        </div>
        <div>
          <div><strong>Sensa SPS</strong><p className="caption muted">{t('在 Unity 中安装四个固定接收器和根部标记，测量根部相对 Avatar 的位置。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('sensa-sps')}>{t('查看根点')}</Button>}
        </div>
        <div>
          <div><strong>{t('Shader 捕获')}</strong><p className="caption muted">{t('在 Unity 中生成根部位置编码画面，再按指南选择屏幕捕获区域，由桥接程序读取坐标。')}</p></div>
          <a href={docUrl('unity/top.sealoong.sensa/GPU-TRACKING.md')} target="_blank" rel="noreferrer">{t('捕获设置')}</a>
        </div>
      </div>
      <p className="caption muted">{t('这些入口只浏览，不会启用输入或连接输出。')}</p>
      <details className="help-order">
        <summary>{t('手动与脚本')}</summary>
        <div className="actions">
          {onNavigate && <Button onClick={() => onNavigate('manual')}>{t('打开手动')}</Button>}
          {onNavigate && <Button onClick={() => onNavigate('script')}>{t('打开脚本')}</Button>}
        </div>
        <p className="caption muted">{t('用手动滑块检查动作方向和范围；加载 funscript 后可按时间播放直线运动。')}</p>
      </details>
      <div className="actions">
        <a href={docUrl('docs/usage-scenarios.md')} target="_blank" rel="noreferrer">{t('使用方案与限制')}</a>
        <a href={docUrl('docs/guide.md')} target="_blank" rel="noreferrer">{t('使用指南')}</a>
        <a href={docUrl('unity/top.sealoong.sensa/README.md')} target="_blank" rel="noreferrer">{t('Unity 指南')}</a>
      </div>
    </Modal>
  );
}
