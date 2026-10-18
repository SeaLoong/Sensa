import React, { useEffect, useRef, useState } from 'react';
import { clampScriptPositionMs, formatDuration, normalizeScriptLoopRange } from './input-workflows.js';
import { t } from './i18n.js';

export function ScriptTimelineDensity({
  bins,
  durationMs,
  currentPositionMs,
  loopStartMs = null,
  loopEndMs = null,
  onSeek,
  onSetLoopBoundary,
  onSelectLoopRange,
  disabled = false,
}) {
  const normalizedBins = Array.isArray(bins) ? bins : [];
  const maxCount = Math.max(1, ...normalizedBins.map(Number));
  const duration = Math.max(0, Number(durationMs || 0));
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    const cancel = (event) => {
      if (event.key !== 'Escape' || !dragRef.current) return;
      event.preventDefault();
      dragRef.current.cancelled = true;
      setSelection(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  const range = normalizeScriptLoopRange(loopStartMs, loopEndMs, duration);
  const percent = (value) => (duration > 0 ? Math.max(0, Math.min(100, (value / duration) * 100)) : 0);
  const positionFromPointer = (event, element) => {
    const rect = element.getBoundingClientRect();
    return clampScriptPositionMs(((event.clientX - rect.left) / Math.max(rect.width, 1)) * duration, duration);
  };
  const finish = (event) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setSelection(null);
    if (state.cancelled) suppressClick.current = true;
    if (state.moved && !state.cancelled) {
      const next = normalizeScriptLoopRange(state.start, state.current, duration);
      if (next.active) onSelectLoopRange?.(next.startMs, next.endMs);
      suppressClick.current = true;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div className="script-density">
      <div
        className={`script-density__plot${disabled ? ' script-density__plot--disabled' : ''}`}
        role="group"
        aria-label={t('动作密度时间轴')}
        onPointerDown={(event) => {
          if (disabled || duration <= 0 || event.button !== 0 || event.shiftKey || event.altKey) return;
          suppressClick.current = false;
          const position = positionFromPointer(event, event.currentTarget);
          dragRef.current = {
            pointerId: event.pointerId,
            start: position,
            current: position,
            startX: event.clientX,
            moved: false,
            cancelled: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const state = dragRef.current;
          if (!state || state.pointerId !== event.pointerId || state.cancelled) return;
          state.current = positionFromPointer(event, event.currentTarget);
          state.moved ||= Math.abs(event.clientX - state.startX) > 5;
          if (state.moved) setSelection([Math.min(state.start, state.current), Math.max(state.start, state.current)]);
        }}
        onPointerUp={finish}
        onPointerCancel={(event) => {
          if (dragRef.current) dragRef.current.cancelled = true;
          finish(event);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && dragRef.current) {
            dragRef.current.cancelled = true;
            setSelection(null);
          }
        }}
        onClick={(event) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (disabled || duration <= 0 || event.detail === 0) return;
          const position = positionFromPointer(event, event.currentTarget);
          if (event.shiftKey) onSetLoopBoundary?.('start', position);
          else if (event.altKey) onSetLoopBoundary?.('end', position);
          else onSeek?.(position);
        }}
      >
        {range.active && (
          <div
            className="script-density__range"
            style={{ left: `${percent(range.startMs)}%`, width: `${percent(range.endMs) - percent(range.startMs)}%` }}
          />
        )}
        {selection && (
          <div
            className="script-density__selection"
            style={{ left: `${percent(selection[0])}%`, width: `${percent(selection[1]) - percent(selection[0])}%` }}
          />
        )}
        <div className="script-density__bars">
          {normalizedBins.length ? (
            normalizedBins.map((count, index) => {
              return (
                <span
                  key={index}
                  className="script-density__bar"
                  aria-hidden="true"
                  style={{ height: `${Math.max(4, (Number(count) / maxCount) * 100)}%` }}
                />
              );
            })
          ) : (
            <span className="muted">{t('载入脚本后显示时间轴')}</span>
          )}
        </div>
        {duration > 0 && <div className="script-density__marker" style={{ left: `${percent(currentPositionMs)}%` }} />}
      </div>
      <div className="time-labels">
        <span>{formatDuration(0)}</span>
        <span>{range.active ? `A ${formatDuration(range.startMs)} — B ${formatDuration(range.endMs)}` : ''}</span>
        <span>{formatDuration(duration)}</span>
      </div>
      <p className="caption muted">{t('点击定位，拖拽设置 A-B；Shift / Alt + 点击设置 A / B。')}</p>
    </div>
  );
}
