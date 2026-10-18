import React from 'react';
import { clampScriptPositionMs, formatDuration, normalizeScriptLoopRange } from './input-workflows.js';
import { t } from './i18n.js';
import { Box, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

function ScriptTimelineDensity({ bins, durationMs, currentPositionMs, loopStartMs = null, loopEndMs = null, onSeek, onSetLoopBoundary, onSelectLoopRange, disabled = false }) {
  const normalizedBins = Array.isArray(bins) ? bins : [];
  const maxCount = normalizedBins.reduce((currentMax, count) => Math.max(currentMax, Number(count) || 0), 0);
  const safeDurationMs = Math.max(0, Number(durationMs || 0));
  const hasTimelineData = normalizedBins.length > 0 && safeDurationMs > 0;
  const markerPercent = safeDurationMs > 0 ? Math.max(0, Math.min(100, (Number(currentPositionMs || 0) / safeDurationMs) * 100)) : 0;
  const loopRange = normalizeScriptLoopRange(loopStartMs, loopEndMs, safeDurationMs);
  const loopStartPercent = loopRange.startMs !== null && safeDurationMs > 0 ? Math.max(0, Math.min(100, (loopRange.startMs / safeDurationMs) * 100)) : null;
  const loopEndPercent = loopRange.endMs !== null && safeDurationMs > 0 ? Math.max(0, Math.min(100, (loopRange.endMs / safeDurationMs) * 100)) : null;
  const rangeStartPercent = loopRange.active && safeDurationMs > 0 ? Math.max(0, Math.min(100, (loopRange.startMs / safeDurationMs) * 100)) : 0;
  const rangeEndPercent = loopRange.active && safeDurationMs > 0 ? Math.max(0, Math.min(100, (loopRange.endMs / safeDurationMs) * 100)) : 0;
  const dragStateRef = useRef(null);
  const suppressNextClickRef = useRef(false);
  const [dragPreview, setDragPreview] = useState(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  const dragPreviewRange = dragPreview ? normalizeScriptLoopRange(dragPreview.startMs, dragPreview.endMs, safeDurationMs) : null;
  const previewStartPercent = dragPreviewRange?.active && safeDurationMs > 0 ? Math.max(0, Math.min(100, (dragPreviewRange.startMs / safeDurationMs) * 100)) : 0;
  const previewEndPercent = dragPreviewRange?.active && safeDurationMs > 0 ? Math.max(0, Math.min(100, (dragPreviewRange.endMs / safeDurationMs) * 100)) : 0;
  const dragPreviewAnchorMs = dragPreview ? clampScriptPositionMs(dragPreview.startMs, safeDurationMs) : null;
  const dragPreviewAnchorPercent = dragPreviewAnchorMs !== null && safeDurationMs > 0 ? Math.max(0, Math.min(100, (dragPreviewAnchorMs / safeDurationMs) * 100)) : 0;
  const hoverPreviewPercent = hoverPreview && safeDurationMs > 0 ? Math.max(0, Math.min(100, (hoverPreview.positionMs / safeDurationMs) * 100)) : 0;
  const previewBadge = (() => {
    if (dragPreviewRange?.active) {
      const centerPercent = (previewStartPercent + previewEndPercent) / 2;
      return {
        variant: 'range',
        left: `clamp(92px, ${centerPercent}%, calc(100% - 92px))`,
        label: t("框选 {0} → {1}", [formatDuration(dragPreviewRange.startMs), formatDuration(dragPreviewRange.endMs)]),
      };
    }

    if (dragPreviewAnchorMs !== null) {
      return {
        variant: 'anchor',
        left: `clamp(92px, ${dragPreviewAnchorPercent}%, calc(100% - 92px))`,
        label: t("起点 {0}", [formatDuration(dragPreviewAnchorMs)]),
      };
    }

    if (hoverPreview) {
      return {
        variant: 'hover',
        left: `clamp(92px, ${hoverPreviewPercent}%, calc(100% - 92px))`,
        label: t("预览 {0} · {1}", [formatDuration(hoverPreview.positionMs), hoverPreview.count > 0 ? t("密度 {0}", [hoverPreview.count]) : t("空白段")]),
      };
    }

    return null;
  })();
  const previewMarkerPercent = dragPreviewRange?.active ? null : dragPreviewAnchorMs !== null ? dragPreviewAnchorPercent : hoverPreview ? hoverPreviewPercent : null;
  const interactionHintText = dragPreviewRange?.active
    ? t("拖拽中：松开后会应用 A-B {0} → {1}；按 Esc 可取消。", [formatDuration(dragPreviewRange.startMs), formatDuration(dragPreviewRange.endMs)])
    : dragPreviewAnchorMs !== null
      ? t("已选起点 {0}，继续拖动可直接框选 A-B。", [formatDuration(dragPreviewAnchorMs)])
      : hoverPreview
        ? t("预览 {0}；点击定位，Shift + 点击设 A，Alt + 点击设 B。", [formatDuration(hoverPreview.positionMs)])
        : t("点击定位；Shift + 点击设 A，Alt + 点击设 B；拖拽可直接框选完整 A-B。");
  const emptyTimelineText = disabled || safeDurationMs <= 0 ? t("载入脚本后这里会显示时间轴摘要。") : t("暂无时间轴摘要");

  useEffect(() => {
    if (!dragStateRef.current) return undefined;

    const clearDragSelection = () => {
      dragStateRef.current = null;
      setDragPreview(null);
    };

    const finalizeDragSelection = event => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      if (state.moved) {
        const nextRange = normalizeScriptLoopRange(state.startMs, state.currentMs, safeDurationMs);
        if (nextRange.active) {
          onSelectLoopRange?.(nextRange.startMs, nextRange.endMs);
        }

        suppressNextClickRef.current = true;
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }

      setHoverPreview({ positionMs: state.currentMs, count: state.currentCount || 0 });

      clearDragSelection();
    };

    const cancelDragSelection = event => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      clearDragSelection();
    };

    const cancelDragSelectionByEscape = event => {
      if (event.key !== 'Escape' || !dragStateRef.current) return;
      event.preventDefault();
      clearDragSelection();
    };

    window.addEventListener('pointerup', finalizeDragSelection);
    window.addEventListener('pointercancel', cancelDragSelection);
    window.addEventListener('keydown', cancelDragSelectionByEscape);

    return () => {
      window.removeEventListener('pointerup', finalizeDragSelection);
      window.removeEventListener('pointercancel', cancelDragSelection);
      window.removeEventListener('keydown', cancelDragSelectionByEscape);
    };
  }, [onSelectLoopRange, safeDurationMs]);

  return (
    <Box className={`script-density${disabled ? ' script-density--disabled' : ''}`}>
      <Box className="script-density__plot">
        {loopRange.active && (
          <>
            <Box className="script-density__range" style={{ left: `${rangeStartPercent}%`, width: `${Math.max(rangeEndPercent - rangeStartPercent, 0)}%` }} aria-hidden="true" />
            <Box className="script-density__range-boundary script-density__range-boundary--start" style={{ left: `${rangeStartPercent}%` }} aria-hidden="true" />
            <Box className="script-density__range-boundary script-density__range-boundary--end" style={{ left: `${rangeEndPercent}%` }} aria-hidden="true" />
          </>
        )}

        {dragPreviewRange?.active && (
          <Box className="script-density__selection" style={{ left: `${previewStartPercent}%`, width: `${Math.max(previewEndPercent - previewStartPercent, 0)}%` }} aria-hidden="true" />
        )}

        {previewMarkerPercent !== null && <Box className="script-density__preview-marker" style={{ left: `${previewMarkerPercent}%` }} aria-hidden="true" />}

        {previewBadge && (
          <Box className={`script-density__preview-badge script-density__preview-badge--${previewBadge.variant}`} style={{ left: previewBadge.left }} aria-hidden="true">
            <Typography variant="caption" className="script-density__preview-text">
              {previewBadge.label}
            </Typography>
          </Box>
        )}

        {loopStartPercent !== null && (
          <Box className="script-density__range-tag script-density__range-tag--start" style={{ left: `clamp(76px, ${loopStartPercent}%, calc(100% - 76px))` }} aria-hidden="true">
            <Typography variant="caption" className="script-density__range-tag-text">
              A {formatDuration(loopRange.startMs)}
            </Typography>
          </Box>
        )}

        {loopEndPercent !== null && (
          <Box className="script-density__range-tag script-density__range-tag--end" style={{ left: `clamp(76px, ${loopEndPercent}%, calc(100% - 76px))` }} aria-hidden="true">
            <Typography variant="caption" className="script-density__range-tag-text">
              B {formatDuration(loopRange.endMs)}
            </Typography>
          </Box>
        )}

        <Box className="script-density__bars" style={{ '--script-density-bin-count': Math.max(normalizedBins.length, 1) }}>
          {normalizedBins.length > 0 ? (
            normalizedBins.map((count, index) => {
              const numericCount = Number(count || 0);
              const heightPercent = maxCount > 0 ? Math.max((numericCount / maxCount) * 100, numericCount > 0 ? 10 : 4) : 4;
              const targetPositionMs = safeDurationMs > 0 ? Math.round(((index + 0.5) / normalizedBins.length) * safeDurationMs) : 0;

              return (
                <button
                  key={`script-density-${index}`}
                  type="button"
                  className={`script-density__bar${numericCount > 0 ? ' script-density__bar--active' : ''}`}
                  style={{ '--script-density-height': `${heightPercent}%` }}
                  disabled={disabled}
                  title={safeDurationMs > 0 ? t("定位 {0}；Shift + 点击设 A，Alt + 点击设 B", [formatDuration(targetPositionMs)]) : t("未加载脚本")}
                  aria-label={safeDurationMs > 0 ? t("定位到 {0}", [formatDuration(targetPositionMs)]) : t("未加载脚本")}
                  onPointerDown={event => {
                    if (disabled || safeDurationMs <= 0 || event.button !== 0) return;

                    dragStateRef.current = {
                      pointerId: event.pointerId,
                      startMs: targetPositionMs,
                      currentMs: targetPositionMs,
                      currentCount: numericCount,
                      moved: false,
                    };

                    setHoverPreview({ positionMs: targetPositionMs, count: numericCount });
                    setDragPreview({ startMs: targetPositionMs, endMs: targetPositionMs });
                  }}
                  onPointerEnter={event => {
                    if (!disabled) {
                      setHoverPreview({ positionMs: targetPositionMs, count: numericCount });
                    }

                    const state = dragStateRef.current;
                    if (!state || state.pointerId !== event.pointerId) return;
                    if (state.currentMs === targetPositionMs) return;

                    state.currentMs = targetPositionMs;
                    state.currentCount = numericCount;
                    state.moved = state.moved || targetPositionMs !== state.startMs;
                    setDragPreview({ startMs: state.startMs, endMs: targetPositionMs });
                  }}
                  onPointerMove={event => {
                    if (!disabled) {
                      setHoverPreview({ positionMs: targetPositionMs, count: numericCount });
                    }

                    const state = dragStateRef.current;
                    if (!state || state.pointerId !== event.pointerId) return;
                    if (state.currentMs === targetPositionMs) return;

                    state.currentMs = targetPositionMs;
                    state.currentCount = numericCount;
                    state.moved = state.moved || targetPositionMs !== state.startMs;
                    setDragPreview({ startMs: state.startMs, endMs: targetPositionMs });
                  }}
                  onPointerLeave={() => {
                    if (!dragStateRef.current) {
                      setHoverPreview(null);
                    }
                  }}
                  onFocus={() => {
                    if (disabled || safeDurationMs <= 0) return;
                    setHoverPreview({ positionMs: targetPositionMs, count: numericCount });
                  }}
                  onBlur={() => {
                    if (!dragStateRef.current) {
                      setHoverPreview(null);
                    }
                  }}
                  onClick={event => {
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }

                    if (disabled) return;
                    if (event.shiftKey) {
                      onSetLoopBoundary?.('start', targetPositionMs);
                      return;
                    }

                    if (event.altKey) {
                      onSetLoopBoundary?.('end', targetPositionMs);
                      return;
                    }

                    onSeek?.(targetPositionMs);
                  }}
                />
              );
            })
          ) : (
            <Box className="script-density__empty">{emptyTimelineText}</Box>
          )}
        </Box>

        {hasTimelineData && <Box className="script-density__marker" style={{ left: `${markerPercent}%` }} aria-hidden="true" />}
      </Box>

      {hasTimelineData && (
        <>
          <Box className="script-density__legend" aria-hidden="true">
            <Box className="script-density__legend-item">
              <Box className="script-density__legend-swatch script-density__legend-swatch--current" />
              <Typography variant="caption" color="text.secondary">{t("播放头")}</Typography>
            </Box>
            <Box className="script-density__legend-item">
              <Box className="script-density__legend-swatch script-density__legend-swatch--preview" />
              <Typography variant="caption" color="text.secondary">{t("悬停 / 预览")}</Typography>
            </Box>
            <Box className="script-density__legend-item">
              <Box className="script-density__legend-swatch script-density__legend-swatch--range" />
              <Typography variant="caption" color="text.secondary">{t("A-B 区间")}</Typography>
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" className="script-density__hint">
            {interactionHintText}
          </Typography>
        </>
      )}
    </Box>
  );
}

export { ScriptTimelineDensity };
