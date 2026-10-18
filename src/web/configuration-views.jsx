import React from 'react';
import { AXIS_MODE_SELECT_OPTIONS, COMMAND_MODE_OPTIONS, RAMP_TYPE_OPTIONS, SIGNAL_CURVE_OPTIONS, SIGNAL_ROLE_OPTIONS, describeCommandModeDetail, formatAxisPositionFromNormalized, getAxisModeSelectValue, getAxisMotionLimitFieldConfig, getSignalSimulationDefaultValue, normalizeCommandMode, normalizeOscHubHost, normalizeOscHubPort, parseAxisModeSelectValue } from './configuration.js';
import { computeSignalPreviewOutput, formatPreviewTimestamp } from './osc-workspace.js';
import { formatCompactNumber, getDynamicFloatSliderBounds, roundToStep } from './numeric.js';
import { HelpLabel, RangeField, SelectField, ValueSliderField } from './controls.jsx';
import { SignalStatusMetric } from './diagnostic-views.jsx';
import { t, diagnostic } from './i18n.js';
import { Alert, Autocomplete, Box, Button, Divider, FormControlLabel, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';

function MotionAxisEditor({ axisDefinition, value, disabled, onChange }) {
  const axisMode = value.mode || 'Normal';
  const isLocked = axisMode === 'Locked';
  const isIgnored = axisMode === 'Ignored';
  const axisModeSelectValue = getAxisModeSelectValue(value);
  const motionLimitField = getAxisMotionLimitFieldConfig(value);

  return (
    <Box className="motion-axis-card">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5} mb={0.5}>
        <Box>
          <Typography variant="subtitle2">{axisDefinition.axis}</Typography>
          <Typography variant="caption" color="text.secondary">
            {axisDefinition.label}
          </Typography>
        </Box>

        <SelectField
          label={t("轴模式")}
          value={axisModeSelectValue}
          options={AXIS_MODE_SELECT_OPTIONS()}
          disabled={disabled}
          variant="compact"
          formControlProps={{ sx: { minWidth: 164, flexShrink: 0 } }}
          onChange={next => onChange(parseAxisModeSelectValue(next))}
        />
      </Stack>

      {isIgnored ? (
        <Typography variant="caption" color="text.secondary">{t("该轴已忽略，不会参与输出。")}</Typography>
      ) : isLocked ? (
        <ValueSliderField
          label={t("锁定位置")}
          title={t("锁定模式下，这个轴会固定在指定位置；位置使用 0-999 的设备尺度表示。")}
          value={Number(value.lockValue || 0)}
          min={0}
          max={1}
          step={0.01}
          valueFormatter={next => formatAxisPositionFromNormalized(next)}
          onChange={next => onChange({ lockValue: next })}
        />
      ) : (
        <>
          <RangeField
            label={t("映射范围")}
            title={t("先把逻辑值 0~1 缩放到这个设备位置区间，再交给边界做最终夹紧。和“边界”不同，它会主动重映射输出。")}
            value={[value.remapMin, value.remapMax]}
            sliderMin={0}
            sliderMax={999}
            inputMin={0}
            inputMax={999}
            startLabel={t("起点")}
            endLabel={t("终点")}
            onChange={([remapMin, remapMax]) => onChange({ remapMin, remapMax })}
          />

          <RangeField
            label={t("边界范围")}
            title={t("最终输出会被夹在这个位置区间内，适合做限位或保留安全余量；它不会把输入重新缩放到这个区间。")}
            value={[value.min, value.max]}
            sliderMin={0}
            sliderMax={999}
            inputMin={0}
            inputMax={999}
            startLabel={axisDefinition.minLabel}
            endLabel={axisDefinition.maxLabel}
            onChange={([min, max]) => onChange({ min, max })}
          />

        </>
      )}

      {!isIgnored && (
        <>
          <Box className="motion-axis-card__command-row">
            <SelectField
              label={t("斜率方式")}
              title={describeCommandModeDetail(value.commandMode)}
              value={normalizeCommandMode(value.commandMode)}
              options={COMMAND_MODE_OPTIONS()}
              disabled={disabled}
              variant="floating"
              className="motion-axis-card__command-select"
              onChange={next => onChange({ commandMode: next })}
            />

            <Box className="motion-axis-card__command-limit">
              <ValueSliderField
                label={motionLimitField.label}
                title={motionLimitField.title}
                value={motionLimitField.value}
                min={motionLimitField.min}
                max={motionLimitField.max}
                step={motionLimitField.step}
                valueFormatter={motionLimitField.valueFormatter}
                onChange={next => onChange({ maxSpeed: motionLimitField.toProfileValue(next) })}
              />
            </Box>
          </Box>

          <Box className="motion-axis-card__ramp-row">
            <SelectField
              label={t("斜率曲线")}
              title={t("非标准扩展：在 S/I 指令后附加 = / < / > / <>。若设备不支持，建议保持“无”。")}
              value={RAMP_TYPE_OPTIONS().some(option => option.value === value.rampType) ? value.rampType : 'None'}
              options={RAMP_TYPE_OPTIONS()}
              disabled={disabled}
              variant="floating"
              className="motion-axis-card__command-select"
              onChange={next => onChange({ rampType: next })}
            />
          </Box>
        </>
      )}
    </Box>
  );
}

function SignalRowDivider() {
  return <Divider orientation="vertical" flexItem className="signal-row__divider" />;
}

function OscHubTargetRow({ target, runtimeTarget, conflictMessages = [], onChange, onRemove }) {
  const hasConflicts = Array.isArray(conflictMessages) && conflictMessages.length > 0;
  const isEnabled = target?.enabled !== false;
  const runtimeError = (runtimeTarget?.lastError || '').trim();
  const statusMeta = (() => {
    if (!isEnabled) return { label: t("已禁用"), color: 'default' };
    if (hasConflicts) return { label: t("配置冲突"), color: 'error' };
    if (!runtimeTarget) return { label: t("待保存"), color: 'primary' };
    if (runtimeError) return { label: t("转发异常"), color: 'error' };
    if (runtimeTarget?.lastSentAtUtc) return { label: t("转发正常"), color: 'success' };
    return { label: t("待收到数据"), color: 'warning' };
  })();
  const endpointSummary = runtimeTarget?.resolvedEndpoint || `${normalizeOscHubHost(target?.host)}:${normalizeOscHubPort(target?.port)}`;
  const activitySummary = runtimeTarget?.lastSentAtUtc ? t("最近 {0}", [formatPreviewTimestamp(runtimeTarget.lastSentAtUtc)]) : '';

  return (
    <Box className={`osc-hub-target${isEnabled ? '' : ' osc-hub-target--disabled'}`}>
      <Box className="osc-hub-target__header">
        <TextField
          className="osc-hub-target__name"
          label={<HelpLabel text={t("目标名称")} title={t("这个名称只用于在当前页面里区分不同 Hub 目标。")} />}
          size="small"
          value={target?.name || ''}
          onChange={event => onChange({ name: event.target.value })}
        />

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" className="osc-hub-target__actions">
          <FormControlLabel
            className="osc-hub-target__toggle"
            sx={{ m: 0 }}
            control={<Switch checked={Boolean(isEnabled)} onChange={(_, checked) => onChange({ enabled: checked })} />}
            label={<Typography variant="body2"><HelpLabel text={t("启用")} title={t("关闭后会保留这条目标配置，但 Hub 不会向它发包。")} /></Typography>}
          />

          <Tooltip title={t("移除这个 Hub 目标")} arrow>
            <Button size="small" color="error" onClick={onRemove}>{t("移除")}</Button>
          </Tooltip>
        </Stack>
      </Box>

      <Box className="osc-hub-target__endpoint-row">
        <TextField
          className="osc-hub-target__host"
          error={hasConflicts}
          label={<HelpLabel text={t("目标地址")} title={t("Hub 转发的 UDP 目标地址。通常是 127.0.0.1 或目标程序所在设备的局域网地址。")} />}
          size="small"
          value={target?.host || ''}
          onChange={event => onChange({ host: event.target.value })}
        />
        <TextField
          className="osc-hub-target__port"
          error={hasConflicts}
          label={<HelpLabel text={t("目标端口")} title={t("Hub 转发的 UDP 目标端口。")} />}
          type="number"
          size="small"
          value={target?.port ?? ''}
          onChange={event => onChange({ port: Number(event.target.value || 0) })}
        />
      </Box>

      <Box className="osc-hub-target__summary">
        <Typography variant="caption" className={`osc-hub-target__summary-status osc-hub-target__summary-status--${statusMeta.color}`}>
          {statusMeta.label}
        </Typography>
        <Typography variant="caption" color="text.secondary" className="osc-hub-target__summary-endpoint" title={endpointSummary}>
          {endpointSummary}
        </Typography>
        {activitySummary ? (
          <Typography variant="caption" color="text.secondary" className="osc-hub-target__summary-activity">
            {activitySummary}
          </Typography>
        ) : <Box />}
      </Box>

      {runtimeError && !hasConflicts && <Alert severity="error" variant="outlined">{diagnostic(runtimeError)}</Alert>}
      {hasConflicts && <Alert severity="warning" variant="outlined">{conflictMessages.join('；')}</Alert>}
    </Box>
  );
}

function SignalMappingRow({ draft, latestEntry, pathOptions, onChange, onRemove }) {
  const [inputSliderMin, inputSliderMax] = getDynamicFloatSliderBounds([draft.vrchatMin, draft.vrchatMax]);
  const simulatedValue = Number.isFinite(Number(draft.simulatedValue)) ? Number(draft.simulatedValue) : getSignalSimulationDefaultValue(draft);
  const [simulationSliderMin, simulationSliderMax] = getDynamicFloatSliderBounds([draft.vrchatMin, draft.vrchatMax, latestEntry?.numericValue, simulatedValue]);
  const liveOutput = draft.sourceMode === 'SpsSocketDepth' || draft.sourceMode === 'SensaPose' && draft.poseMetric === 'Roll' ? null : computeSignalPreviewOutput(draft, latestEntry?.numericValue);
  const simulatedOutput = draft.simulateEnabled ? computeSignalPreviewOutput(draft, simulatedValue) : null;
  const simulationValueText = formatCompactNumber(simulatedValue, 2);
  const statusMetrics = latestEntry
    ? [
        { key: 'live-input', label: ['SensaPose','SensaPoint'].includes(draft.sourceMode) ? t("解算输入") : draft.sourceMode === 'SpsSocketDepth' ? t("原始采样") : t("实时输入"), value: latestEntry.value ?? '—', tone: 'live' },
        { key: 'live-output', label: t("预估位置"), value: liveOutput?.mappedPositionText || '—', tone: liveOutput ? 'live' : 'muted' },
      ]
    : [
        { key: 'live-input-missing', label: t("实时输入"), value: t("未命中"), tone: 'muted' },
        { key: 'live-output-missing', label: t("预估位置"), value: '—', tone: 'muted' },
      ];
  const visibleStatusMetrics = draft.simulateEnabled
    ? [
        { key: 'sim-input', label: t("模拟输入"), value: simulationValueText, tone: 'simulated' },
        { key: 'sim-output', label: t("模拟位置"), value: simulatedOutput?.mappedPositionText || '—', tone: simulatedOutput ? 'simulated' : 'muted' },
      ]
    : statusMetrics;
  const metaSummaryText = !draft.simulateEnabled && latestEntry?.path && latestEntry.path !== draft.oscPath
      ? t("命中 {0}{1}", [latestEntry.path, latestEntry.matchCount > 1 ? t(" · {0} 条", [latestEntry.matchCount]) : ''])
      : !draft.simulateEnabled && latestEntry?.matchCount > 1
        ? t("命中 {0} 条参数", [latestEntry.matchCount])
        : '';

  return (
    <Box className="signal-row">
      <Box className="signal-row__header">
        <Autocomplete
          freeSolo
          fullWidth
          className="signal-row__path"
          options={Array.isArray(pathOptions) ? pathOptions : []}
          value={draft.oscPath}
          inputValue={draft.oscPath}
          autoHighlight
          openOnFocus
          selectOnFocus
          clearOnBlur={false}
          filterOptions={(options, state) => {
            const keyword = (state.inputValue || '').trim().toLowerCase();
            if (!keyword) return options;
            return options.filter(option => option.toLowerCase().includes(keyword));
          }}
          onInputChange={(_, nextInputValue, reason) => {
            if (reason === 'input' || reason === 'reset' || reason === 'clear') {
              onChange({ oscPath: nextInputValue || '' });
            }
          }}
          renderInput={params => (
            <TextField
              {...params}
              label={<HelpLabel text={t("参数路径")} title={t("支持精确匹配、*、**；多个候选路径用分号分隔。所有命中值参与融合，同轴选择校准后强度更高的值；预览显示最近更新值。")} />}
              size="small"
              placeholder={t("例如: OGB/Orf/Pussy/Main/PenOthers")}
            />
          )}
        />

        <SelectField label={t("输入解释")} value={draft.sourceMode || 'Direct'} options={[{ value: 'Direct', label: t("直接映射") }, { value: 'SpsSocketDepth', label: t("SPS Root/Tip 深度") }, { value: 'SensaPose', label: t("Sensa 空间定位") }, {value:'SensaPoint',label:t("本地骨骼 / PB 位置")}]} onChange={sourceMode => onChange({ sourceMode })} />
        {draft.sourceMode === 'SensaPoint' && <SelectField label={t("本地点指标（局部 m）")} value={draft.pointMetric || 'Z'} options={['X','Y','Z','Distance'].map(value=>({value,label:value==='Distance'?t("距参考原点"):value}))} onChange={pointMetric=>onChange({pointMetric})} />}
        {draft.sourceMode === 'SensaPose' && <SelectField label={t("定位指标")} value={draft.poseMetric || 'Depth'} options={[
          { value: 'Depth', label: t("入孔比例 0–1") }, { value: 'OffsetX', label: t("孔口 X 偏移（m）") }, { value: 'OffsetY', label: t("孔口 Y 偏移（m）") },
          { value: 'Yaw', label: t("偏航（度）") }, { value: 'Pitch', label: t("俯仰（度）") }, { value: 'Roll', label: t("扭转（度）") },
        ]} onChange={poseMetric => onChange({ poseMetric })} />}
        <SelectField
          label={t("目标轴")}
          title={t("选择这条 OSC 映射最终驱动的设备轴；同一目标轴的多条规则在重叠区当前不会叠加，而是优先采用校准后更深（归一化更高）的那条映射结果。当前约定里 L1 为数值小=前、数值大=后。")}
          value={draft.role}
          options={SIGNAL_ROLE_OPTIONS()}
          variant="compact"
          fullWidth
          className="signal-row__role"
          onChange={next => onChange({ role: next })}
        />

        <FormControlLabel
          className="signal-row__toggle"
          sx={{ m: 0 }}
          control={<Switch checked={Boolean(draft.invertDirection)} onChange={(_, checked) => onChange({ invertDirection: checked })} />}
          label={<HelpLabel text={t("反向")} title={t("交换输入最小值 / 输入最大值的方向，常用于深度方向相反或姿态方向相反的参数。")} />}
        />

        <Button size="small" color="error" className="signal-row__remove" onClick={onRemove}>{t("移除")}</Button>
      </Box>

      <Box className="signal-row__controls">
        <Box className="signal-row__section signal-row__section--status">
          <Box className="signal-row__status-panel">
            <Box className="signal-row__status-top">
              {visibleStatusMetrics.map(metric => (
                <SignalStatusMetric key={metric.key} label={metric.label} value={metric.value} tone={metric.tone} />
              ))}

              <FormControlLabel
                className="signal-row__simulation-toggle signal-row__simulation-toggle--inline"
                sx={{ m: 0 }}
                control={
                  <Switch
                    checked={Boolean(draft.simulateEnabled)}
                    onChange={(_, checked) => onChange({ simulateEnabled: checked, simulatedValue: checked ? simulatedValue : draft.simulatedValue })}
                  />
                }
                label={<HelpLabel text={t("模拟")} title={t("只在当前页面里做预览，不会发给后端，也不会写入配置。适合在没有真实 OSC 参数时，先试输入范围、曲线和映射范围会落到什么设备位置。")} />}
              />
            </Box>

            {metaSummaryText ? (
              <Box className="signal-row__meta-list">
                <Typography variant="caption" color="text.secondary" className="signal-row__meta-text" title={metaSummaryText}>
                  {metaSummaryText}
                </Typography>
              </Box>
            ) : null}
          </Box>

          {draft.simulateEnabled ? (
            <Box className="signal-row__simulation-field">
              <ValueSliderField
                label={t("模拟参数值")}
                title={t("本地预览用的原始输入值。拖动它可以直接看到当前输入范围、曲线与映射范围会把这个值变成哪个设备位置。")}
                value={simulatedValue}
                min={simulationSliderMin}
                max={simulationSliderMax}
                step={0.01}
                valueFormatter={next => formatCompactNumber(next, 2)}
                onChange={next => onChange({ simulatedValue: roundToStep(Number(next), 0.01) })}
              />

              {simulatedOutput && (
                <Typography variant="caption" color="text.secondary" className="signal-row__simulation-note">{t("模拟：")}{simulationValueText} → {simulatedOutput.normalizedText} → {simulatedOutput.curvedText} → {simulatedOutput.mappedPositionText}
                </Typography>
              )}
            </Box>
          ) : null}
        </Box>

        <SignalRowDivider />

        <Box className="signal-row__section signal-row__section--range">
          <RangeField
            label={t("输入范围")}
            title={t("把原始 OSC 值的某一段校准为逻辑 0~1。比如设成 0.25~0.75，就会把原始 25%~75% 放大成设备完整行程；超出区间的值会被夹到 0/1。")}
            value={[draft.vrchatMin, draft.vrchatMax]}
            sliderMin={inputSliderMin}
            sliderMax={inputSliderMax}
            step={0.01}
            valueFormatter={next => formatCompactNumber(next, 2)}
            onChange={([vrchatMin, vrchatMax]) => onChange({ vrchatMin, vrchatMax })}
          />
        </Box>

        <SignalRowDivider />

        <Box className="signal-row__section signal-row__section--range">
          <RangeField
            label={t("映射范围")}
            title={t("校准和曲线处理后的逻辑 0/1，会被放到这个设备位置区间；范围 0-999。比如把完整输入限制在设备的 200~800 行程，就在这里设 200~800。")}
            value={[draft.mappedMin, draft.mappedMax]}
            sliderMin={0}
            sliderMax={999}
            onChange={([mappedMin, mappedMax]) => onChange({ mappedMin, mappedMax })}
          />
        </Box>

        <SignalRowDivider />

        <Box className="signal-row__section signal-row__section--curve">
          <SelectField
            label={t("映射曲线")}
            title={t("它改变的是输入值到逻辑目标值的分布，不直接改变最终发给设备的 S/I 形式。缓入适合前段更细，缓出适合后段更细，缓入缓出则让两端更平滑、中段更灵敏。")}
            value={draft.curve || 'Linear'}
            options={SIGNAL_CURVE_OPTIONS()}
            variant="floating"
            className="signal-row__curve-field"
            onChange={next => onChange({ curve: next })}
          />
        </Box>
      </Box>
    </Box>
  );
}

export { MotionAxisEditor, OscHubTargetRow, SignalMappingRow };
