import React from 'react';
import { t, docUrl } from './i18n.js';
import { Button, Modal } from './ui.jsx';

export default function HelpDialog({ open, onClose, onNavigate, emergencyAction, error }) {
  return (
    <Modal open={open} emergencyAction={emergencyAction} error={error} title={t('使用帮助')}
      onClose={onClose} actions={<Button onClick={onClose}>{t('关闭帮助')}</Button>}>
      <div className="usage-choices">
        <div>
          <div><strong>OGB / SPS</strong><p className="caption muted">{t('读取现有 OGB 参数，自动兼容 Root/Tip 与单触发器。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('osc')}>{t('配置 OGB')}</Button>}
        </div>
        <div>
          <div><strong>Sensa SPS</strong><p className="caption muted">{t('固定四锚点与专用根标记，还原 Avatar 局部坐标。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('sensa-sps')}>{t('查看根点')}</Button>}
        </div>
        <div>
          <div><strong>{t('Shader 捕获')}</strong><p className="caption muted">{t('根点编码图块经明确选择的屏幕区域解码，需配置生产端与捕获。')}</p></div>
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
        <p className="caption muted">{t('手动用于检查设备；funscript 提供 L0 时间线。')}</p>
      </details>
      <div className="actions">
        <a href={docUrl('docs/usage-scenarios.md')} target="_blank" rel="noreferrer">{t('使用方案与限制')}</a>
        <a href={docUrl('docs/guide.md')} target="_blank" rel="noreferrer">{t('使用指南')}</a>
        <a href={docUrl('unity/top.sealoong.sensa/README.md')} target="_blank" rel="noreferrer">{t('Unity 指南')}</a>
      </div>
    </Modal>
  );
}
