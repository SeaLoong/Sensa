import React from 'react';
import { t, getLocale, diagnostic } from './i18n.js';
import { Badge } from './ui.jsx';
import { outputPreview } from './output-preview.js';

export default function OutputPositionPanel({ state }) {
  const preview = outputPreview(state);
  return (
    <div className="output-position-panel">
      <div className="actions">
        <strong>{t('发送目标')}</strong>
        <Badge tone={preview.phase === 'error' ? 'error' : preview.phase === 'sent' ? 'success' : 'default'}>
          {preview.label}
        </Badge>
      </div>
      {preview.targets.length === 0 ? (
        <p className="muted">{t('尚未发送目标')}</p>
      ) : (
        <div className="output-position-axes">
          {preview.targets.map((target) => (
            <div key={target.key}>
              <div className="value-field__heading">
                <span>{diagnostic(target.label)}</span>
                <strong>{target.maximum === 999 ? Math.round(target.value) : target.value.toFixed(1) + '%'}</strong>
              </div>
              <progress aria-label={diagnostic(target.label)} value={target.percent} max="100" />
            </div>
          ))}
        </div>
      )}
      <p className="caption muted">
        {t('命令值，非设备回读。')}
        {preview.lastSentAtUtc && (
          <span data-testid="output-last-sent"> {new Date(preview.lastSentAtUtc).toLocaleTimeString(getLocale())}</span>
        )}
      </p>
    </div>
  );
}
