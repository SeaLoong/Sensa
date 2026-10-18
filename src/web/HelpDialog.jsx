import React from 'react';
import { t, docUrl } from './i18n.js';
import { Button, Modal } from './ui.jsx';

export default function HelpDialog({ open, onClose, emergencyAction, error }) {
  return (
    <Modal
      open={open}
      emergencyAction={emergencyAction}
      error={error}
      title={t('使用帮助')}
      onClose={onClose}
      actions={<Button onClick={onClose}>{t('关闭帮助')}</Button>}
    >
      <ol className="help-steps">
        <li>{t('添加输出，检查连接和量程。')}</li>
        <li>{t('应用输入方式；OSC 保存映射，脚本载入文件。')}</li>
        <li>{t('检查目标后启用输入。')}</li>
        <li>{t('解除急停后，输入仍保持关闭。')}</li>
      </ol>
      <div className="actions">
        <a href={docUrl('docs/guide.md')} target="_blank" rel="noreferrer">
          {t('使用指南')}
        </a>
        <a href={docUrl('unity/top.sealoong.sensa/README.md')} target="_blank" rel="noreferrer">
          {t('Unity 指南')}
        </a>
      </div>
    </Modal>
  );
}
