import React from 'react';
import { t, docUrl } from './i18n.js';
import { Button, Modal } from './ui.jsx';

export default function HelpDialog({ open, onClose }) {
  return (
    <Modal
      open={open}
      title={t('使用帮助')}
      onClose={onClose}
      actions={<Button onClick={onClose}>{t('关闭帮助')}</Button>}
    >
      <ol className="help-steps">
        <li>{t('添加输出，设置连接与轴范围。')}</li>
        <li>{t('选择输入方式并应用；OSC 需要保存映射，脚本需要载入文件。')}</li>
        <li>{t('检查目标后手动启用输入。切换方式、脚本或保存配置会关闭输入。')}</li>
        <li>{t('紧急停止会锁住输出；解除后仍需重新启用输入。')}</li>
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
