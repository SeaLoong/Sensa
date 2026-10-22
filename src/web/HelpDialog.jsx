import React from 'react';
import { t, docUrl } from './i18n.js';
import { Button, Modal } from './ui.jsx';

export default function HelpDialog({ open, onClose, onNavigate, emergencyAction, error }) {
  return (
    <Modal open={open} emergencyAction={emergencyAction} error={error} title={t('使用帮助')}
      onClose={onClose} actions={<Button onClick={onClose}>{t('关闭帮助')}</Button>}>
      <div className="usage-choices">
        <div>
          <div><strong>OGB / SPS</strong><p className="caption muted">{t('接收 OGB / SPS 接触参数后，选择要使用的对象，再校准动作范围。SPS2 使用 PenOthersNewRoot / PenOthersNewTip，SPS1 使用 PenOthers / PenOthersClose。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('osc')}>{t('配置 OGB')}</Button>}
        </div>
        <div>
          <div><strong>{t('根点定位')}</strong><p className="caption muted">{t('Unity 可选择四点定位或 Contact 直接定位（SDK Beta）。四点定位计算根点位置，Contact 直接定位还提供相对速度；在根点面板选择目标后，校准位置行程或速度强度。')}</p></div>
          <div className="actions">
            {onNavigate && <Button onClick={() => onNavigate('sensa-sps')}>{t('查看根点')}</Button>}
            <a href={docUrl('docs/contact-sdk.md')} target="_blank" rel="noreferrer">{t('Contact SDK 设置')}</a>
          </div>
        </div>
        <div>
          <div><strong>{t('Shader 捕获')}</strong><p className="caption muted">{t('在 Unity 中生成根部位置编码画面，再按指南选择屏幕捕获区域，由桥接程序读取坐标。')}</p></div>
          <a href={docUrl('unity/top.sealoong.sensa/GPU-TRACKING.md')} target="_blank" rel="noreferrer">{t('捕获设置')}</a>
        </div>
      </div>
      <p className="caption muted">{t('打开入口后可查看和配置；完成检查后，在控制页连接输出并启用输入。')}</p>
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
