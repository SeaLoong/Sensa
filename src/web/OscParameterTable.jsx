import React, { useEffect, useState } from 'react';
import { t } from './i18n.js';
import { Button } from './ui.tsx';
import { SelectField } from './controls.jsx';
import { formatPreviewTimestamp, paginateOscPreview } from './osc-workspace.js';

export default function OscParameterTable({ entries, pinnedPaths, filterKey, onTogglePinned, onInspect, onMap }) {
  const [selection, setSelection] = useState({ key: filterKey, page: 0 });
  const page = paginateOscPreview(entries, selection.key === filterKey ? selection.page : 0);
  useEffect(() => {
    setSelection(previous => previous.key === filterKey && previous.page === page.page
      ? previous : { key: filterKey, page: page.page });
  }, [filterKey, page.page]);
  const pinned = new Set(pinnedPaths);
  const selectPage = index => setSelection({ key: filterKey, page: index });
  return (
    <>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={t('OSC 参数表')}>
        <table className="parameter-table">
          <caption className="sr-only">{t('OSC 参数表')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('置顶')}</th>
              <th scope="col">{t('参数')}</th>
              <th scope="col">{t('值')}</th>
              <th scope="col">{t('来源')}</th>
              <th scope="col">{t('时间')}</th>
              <th scope="col">{t('操作')}</th>
            </tr>
          </thead>
          <tbody>
            {page.entries.map(entry => (
              <tr key={JSON.stringify([entry.sourceKey || '', entry.path])} className={entry._matches?.length ? 'is-mapped' : ''}>
                <td>
                  <Button aria-label={`${pinned.has(entry.path) ? t('取消置顶') : t('置顶')} ${entry.path}`}
                    onClick={() => onTogglePinned(entry.path)}>
                    {pinned.has(entry.path) ? '★' : '☆'}
                  </Button>
                </td>
                <td><button className="parameter-link" type="button" onClick={() => onInspect(entry)}>{entry.path}</button></td>
                <td className="mono parameter-value">{entry.value ?? '—'}</td>
                <td className="caption">{entry.sourceLabel || '—'}</td>
                <td data-testid="osc-timestamp" className="caption mono parameter-time">{formatPreviewTimestamp(entry.timestampMs)}</td>
                <td><Button aria-label={t('映射 {0}', [entry.path])} onClick={() => onMap(entry)}>{t('映射')}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!page.total && <p className="empty-state">{t('暂无匹配参数')}</p>}
      </div>
      {page.total > 100 && (
        <nav className="actions" aria-label={t('OSC 参数分页')}>
          <Button disabled={page.page === 0} onClick={() => selectPage(page.page - 1)}>{t('上一页')}</Button>
          <SelectField label={t('页码')} value={page.page + 1}
            options={Array.from({ length: page.pages }, (_, index) => ({ value: index + 1, label: String(index + 1) }))}
            onChange={value => selectPage(Number(value) - 1)} />
          <span className="muted" role="status">{t('显示第 {0}–{1} 项，共 {2} 项', [page.first, page.last, page.total])}</span>
          <Button disabled={page.page === page.pages - 1} onClick={() => selectPage(page.page + 1)}>{t('下一页')}</Button>
        </nav>
      )}
    </>
  );
}
