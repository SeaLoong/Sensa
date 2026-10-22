import React, { useMemo } from 'react';
import '../../docs/assets/osc-parameter-reference.js';
import { getLocale, t } from './i18n.js';
import { parameterMeaning } from './osc-preview.js';

export default function OscParameterReference({ path }) {
  const locale = getLocale();
  const reference = useMemo(() => globalThis.SensaOscParameterReference.lookup(path, locale), [path, locale]);
  if (!reference) return <p data-testid="parameter-reference-summary">{parameterMeaning(path)}</p>;

  return (
    <section className="parameter-reference stack" aria-label={t('参数说明')}>
      <div className="stack parameter-reference__intro">
        <h3>{reference.title}</h3>
        <p data-testid="parameter-reference-summary">{reference.summary}</p>
      </div>
      <dl className="parameter-reference__facts">
        <div><dt>{t('参数类型')}</dt><dd>{reference.valueType}</dd></div>
        <div><dt>{t('数值范围')}</dt><dd data-testid="parameter-reference-range">{reference.range}</dd></div>
        <div><dt>{t('单位')}</dt><dd data-testid="parameter-reference-unit">{reference.unit}</dd></div>
      </dl>
      <div className="stack parameter-reference__text">
        <h3>{reference.definitionLabel}</h3>
        <p data-testid="parameter-reference-definition">{reference.definition}</p>
      </div>
      <div className="stack parameter-reference__text">
        <h3>{t('联动用法')}</h3>
        <p data-testid="parameter-reference-usage">{reference.usage}</p>
      </div>
      <div className="stack parameter-reference__text">
        <h3>{t('说明来源')}</h3>
        <ul className="parameter-reference__sources" data-testid="parameter-reference-sources">
          {reference.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}
        </ul>
      </div>
    </section>
  );
}
