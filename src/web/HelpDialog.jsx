import React from 'react';
import { t, docUrl } from './i18n.js';
import { Button, ButtonLink, Disclosure, Modal } from './ui.tsx';

export default function HelpDialog({ open, onClose, onNavigate, emergencyAction, error, supportsListeners = true }) {
  const guide = (path, label) => <ButtonLink variant="text" href={docUrl(path)} target="_blank" rel="noreferrer">{label}</ButtonLink>;
  return (
    <Modal open={open} emergencyAction={emergencyAction} error={error} title={t('从这里开始')} wide
      onClose={onClose} actions={<Button onClick={onClose}>{t('关闭帮助')}</Button>}>
      <p className="help-intro">{supportsListeners
        ? t('Sensa 把 VRChat / SPS、funscript 或网站控制连接到 OSR 和其他互动设备。先连接设备，再选择一种用法。')
        : t('WebSensa 可以直接在浏览器中手动控制设备，或播放 funscript。先连接设备，再选择一种用法。')}</p>
      {onNavigate && <div className="actions"><Button tone="primary" onClick={() => onNavigate('outputs')}>{t('连接设备')}</Button></div>}
      <div className="usage-choices">
        {supportsListeners && <div>
          <div><h3>{t('VRChat / SPS 联动')}</h3><p className="caption muted">{t('选择 OGB / SPS 预设，把 Avatar 的接触深度或触摸转换为设备动作。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('osc')}>{t('设置 VRChat / SPS')}</Button>}
        </div>}
        <div>
          <div><h3>{t('播放 funscript')}</h3><p className="caption muted">{t('载入已有脚本，用时间线播放、暂停和定位。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('script')}>{t('打开脚本')}</Button>}
        </div>
        <div>
          <div><h3>{t('手动控制设备')}</h3><p className="caption muted">{t('位置控制用 L0；振动、旋转等控制在“更多动作轴”中。')}</p></div>
          {onNavigate && <Button onClick={() => onNavigate('manual')}>{t('打开手动')}</Button>}
        </div>
      </div>
      <Disclosure title={t('更多连接与测量')}>
        <div className="usage-choices">
          {supportsListeners && <div>
            <div><h3>{t('转发网站或软件的控制')}</h3><p className="caption muted">{t('把 Sensa 作为 Intiface 等协议的虚拟设备，再把收到的动作发送给 OSR 或其他设备。')}</p></div>
            {onNavigate && <Button onClick={() => onNavigate('protocol-settings')}>{t('配置协议输入')}</Button>}
          </div>}
          <div>
            <div><h3>{t('组合或处理多个来源')}</h3><p className="caption muted">{t('需要合并、平滑或把结果送到多个目标时，打开流程。')}</p></div>
            {onNavigate && <div className="actions"><Button onClick={() => onNavigate('pipeline')}>{t('编辑信号流程')}</Button>
              <Button onClick={() => onNavigate('recording')}>{t('录制动作')}</Button></div>}
          </div>
          {supportsListeners && <div>
            <div><h3>{t('测量 Avatar 的位置')}</h3><p className="caption muted">{t('添加 Unity 测量组件，读取 SPS 根点、方向或跟随参考平面。')}</p></div>
            <div className="actions">{onNavigate && <Button onClick={() => onNavigate('sensa-sps')}>{t('查看根点')}</Button>}
              {guide('unity/top.sealoong.sensa/README.md', t('Unity 指南'))}</div>
          </div>}
        </div>
      </Disclosure>
      <div className="help-links">
        {guide('docs/quick-start.md', t('快速上手'))}
        {guide('docs/guide.md', t('使用指南'))}
        {guide('docs/usage-scenarios.md', t('使用方案'))}
      </div>
    </Modal>
  );
}
