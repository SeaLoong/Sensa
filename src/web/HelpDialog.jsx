import React from 'react';
import { t, docUrl } from './i18n.js';
import { Button, Modal } from './ui.jsx';

export default function HelpDialog({ open, onClose, onNavigate, emergencyAction, error }) {
  return (
    <Modal open={open} emergencyAction={emergencyAction} error={error} title={t('使用帮助')}
      onClose={onClose} actions={<Button onClick={onClose}>{t('关闭帮助')}</Button>}>
      <div className="usage-choices">
        <div>
          <div><strong>{t('手动测试')}</strong><p className="caption muted">{t('十二轴目标；连续发送跟随调整。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('manual')}>{t('打开手动')}</Button>}
        </div>
        <div>
          <div><strong>{t('脚本播放')}</strong><p className="caption muted">{t('funscript 时间线生成 L0 目标。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('script')}>{t('打开脚本')}</Button>}
        </div>
        <div>
          <div><strong>{t('OSC 映射')}</strong><p className="caption muted">{t('PB、SPS／OGB 或自定义标量。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('osc')}>{t('配置 OSC')}</Button>}
        </div>
      </div>
      <p className="caption muted">{t('这些入口只浏览，不会启用输入或连接输出。')}</p>
      <details className="help-order">
        <summary>{t('通用设置顺序')}</summary>
        <ol className="help-steps">
          <li>{t('添加输出，检查连接和量程。')}</li>
          <li>{t('应用输入方式；OSC 保存映射，脚本载入文件。')}</li>
          <li>{t('检查目标后启用输入。')}</li>
          <li>{t('解除急停后，输入仍保持关闭。')}</li>
        </ol>
      </details>
      <div className="actions">
        <a href={docUrl('docs/usage-scenarios.md')} target="_blank" rel="noreferrer">{t('使用方案与限制')}</a>
        <a href={docUrl('docs/guide.md')} target="_blank" rel="noreferrer">{t('使用指南')}</a>
        <a href={docUrl('unity/top.sealoong.sensa/README.md')} target="_blank" rel="noreferrer">{t('Unity 指南')}</a>
      </div>
    </Modal>
  );
}
