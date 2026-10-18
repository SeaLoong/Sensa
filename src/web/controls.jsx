import React from 'react';
import { formatCompactNumber, normalizeRangePair, precisionFromStep } from './numeric.js';
import { t } from './i18n.js';
import { Box, Chip, FormControl, InputLabel, MenuItem, Select, Slider, Stack, Tooltip, Typography } from '@mui/material';

function TabPanel({ value, current, children }) {
  return value === current ? <Box sx={{ pt: 0.75, minWidth: 0, width: '100%' }}>{children}</Box> : null;
}

function MetricCard({ label, value, tone = 'default' }) {
  return (
    <Box className={`metric-card metric-card--${tone}`}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6">{value}</Typography>
    </Box>
  );
}

function ScriptHotkeyItem({ shortcut, label, description, statusLabel = '', statusColor = 'default' }) {
  const tooltipText = `${label}：${description}${statusLabel ? `（${statusLabel}）` : ''}`;

  return (
    <Tooltip title={tooltipText} arrow placement="top-start">
      <Box tabIndex={0} className={`script-hotkey-item script-hotkey-item--${statusColor}`}>
        <Typography variant="caption" component="div" className="script-hotkey-item__key">
          {shortcut}
        </Typography>
        <Box className="script-hotkey-item__body">
          <Typography variant="body2" className="script-hotkey-item__label">
            {label}
          </Typography>
          {statusLabel ? (
            <Typography variant="caption" className={`script-hotkey-item__status script-hotkey-item__status--${statusColor}`}>
              {statusLabel}
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Tooltip>
  );
}

function ScriptActionButtonLabel({ label, shortcut = '' }) {
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center" justifyContent="center" className="script-action-button__content">
      <Box component="span">{label}</Box>
      {shortcut ? <Box component="span" className="script-action-button__hint">{shortcut}</Box> : null}
    </Stack>
  );
}

function HelpLabel({ text, title, placement = 'top' }) {
  const content = (
    <Box component="span" className={`field-help-label${title ? ' field-help-label--hint' : ''}`}>
      {text}
    </Box>
  );

  return title ? (
    <Tooltip title={title} arrow placement={placement}>
      {content}
    </Tooltip>
  ) : (
    content
  );
}

function TooltipHintIcon({ title, placement = 'top', className = '', ariaLabel = t("查看说明") }) {
  if (!title) return null;

  return (
    <Tooltip title={title} arrow placement={placement}>
      <Box component="span" tabIndex={0} role="img" aria-label={ariaLabel} className={`field-hint-icon${className ? ` ${className}` : ''}`}>
        i
      </Box>
    </Tooltip>
  );
}

function FieldPanel({ label, title, valueText = null, className = '', children }) {
  return (
    <Box className={`field-panel${className ? ` ${className}` : ''}`}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="field-panel__header">
        <Typography variant="caption" color="text.secondary" component="div">
          <HelpLabel text={label} title={title} />
        </Typography>
        <Typography variant="caption" className="field-panel__value">
          {valueText ?? '\u00A0'}
        </Typography>
      </Stack>

      <Box className="field-panel__body">{children}</Box>
    </Box>
  );
}

function SelectField({
  label,
  title,
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  variant = 'panel',
  hintTitle = '',
  hintPlacement = 'top',
  formControlProps = {},
  selectProps = {},
  menuProps,
  renderOption,
  fullWidth,
}) {
  const normalizedOptions = Array.isArray(options) ? options : [];
  const selectedOption = normalizedOptions.find(option => option.value === value) || null;
  const isInline = variant === 'inline';
  const isFloating = variant === 'floating';
  const isCompact = variant === 'compact';
  const shouldRenderInputLabel = isInline || isFloating || isCompact;
  const resolvedFullWidth = typeof fullWidth === 'boolean' ? fullWidth : !isCompact;

  const selectControl = (
    <FormControl
      size="small"
      fullWidth={resolvedFullWidth}
      className={`select-field__control${isFloating ? ' select-field__control--floating' : ''}${isCompact ? ' select-field__control--compact' : ''}`}
      disabled={disabled}
      {...formControlProps}
    >
      {shouldRenderInputLabel && (
        <InputLabel
          className={`select-field__input-label${title && !(isFloating || isCompact) ? ' select-field__input-label--hint' : ''}${isFloating ? ' select-field__input-label--floating' : ''}${isCompact ? ' select-field__input-label--compact' : ''}`}
        >
          {isFloating || isCompact ? <HelpLabel text={label} title={title} placement={hintPlacement} /> : label}
        </InputLabel>
      )}
      <Select value={value} label={shouldRenderInputLabel ? label : undefined} MenuProps={menuProps} onChange={event => onChange(event.target.value)} {...selectProps}>
        {normalizedOptions.map(option => (
          <MenuItem key={option.value} value={option.value} disabled={Boolean(option.disabled)}>
            {typeof renderOption === 'function' ? renderOption(option) : option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  if (isCompact) {
    return <Box className={`select-field select-field--compact${className ? ` ${className}` : ''}`}>{selectControl}</Box>;
  }

  if (isInline) {
    const inlineField = (
      <Box className={`select-field select-field--inline${className ? ` ${className}` : ''}`}>
        {selectControl}
        <TooltipHintIcon title={hintTitle} placement={hintPlacement} className="select-field__hint" />
      </Box>
    );

    return title ? (
      <Tooltip title={title} arrow placement="top">
        <Box>{inlineField}</Box>
      </Tooltip>
    ) : (
      inlineField
    );
  }

  if (isFloating) {
    return <Box className={`select-field select-field--floating${className ? ` ${className}` : ''}`}>{selectControl}</Box>;
  }

  return (
    <FieldPanel label={label} title={title} valueText={selectedOption?.label || null} className={`select-field${className ? ` ${className}` : ''}`}>
      {selectControl}
    </FieldPanel>
  );
}

function SliderControl({ value, onChange, onChangeCommitted, valueFormatter = next => next, className = '', valueLabelDisplay = 'auto', ...props }) {
  return (
    <Slider
      {...props}
      className={`slider-control${className ? ` ${className}` : ''}`}
      value={value}
      valueLabelDisplay={valueLabelDisplay}
      valueLabelFormat={valueFormatter}
      onChange={(_, next) => onChange?.(next)}
      onChangeCommitted={(_, next) => onChangeCommitted?.(next)}
    />
  );
}

function SliderField({
  label,
  title,
  value,
  onChange,
  sliderMin,
  sliderMax,
  step = 1,
  min,
  max,
  valueFormatter = next => formatCompactNumber(next, precisionFromStep(step)),
}) {
  const isRange = Array.isArray(value);
  const [startValue, endValue] = isRange ? value : [value, value];
  const minBound = Number.isFinite(min) ? min : sliderMin;
  const maxBound = Number.isFinite(max) ? max : sliderMax;

  const handleChange = next => {
    if (isRange) {
      const [nextStart, nextEnd] = Array.isArray(next) ? next : [next, next];
      onChange(
        normalizeRangePair(nextStart, nextEnd, {
          min: Number.isFinite(minBound) ? minBound : null,
          max: Number.isFinite(maxBound) ? maxBound : null,
          step,
          fallbackStart: startValue,
          fallbackEnd: endValue,
        }),
      );
      return;
    }

    onChange(
      normalizeRangePair(next, next, {
        min: Number.isFinite(minBound) ? minBound : null,
        max: Number.isFinite(maxBound) ? maxBound : null,
        step,
        fallbackStart: startValue,
        fallbackEnd: startValue,
      })[0],
    );
  };

  return (
    <FieldPanel label={label} title={title} valueText={isRange ? `${valueFormatter(startValue)}-${valueFormatter(endValue)}` : valueFormatter(startValue)} className="range-field">
      <SliderControl
        min={sliderMin}
        max={sliderMax}
        step={step}
        value={isRange ? [startValue, endValue] : startValue}
        valueFormatter={valueFormatter}
        onChange={next => handleChange(next)}
      />
    </FieldPanel>
  );
}

function RangeField({
  label,
  title,
  value,
  onChange,
  sliderMin,
  sliderMax,
  step = 1,
  inputStep = step,
  inputMin,
  inputMax,
  startLabel = t("起"),
  endLabel = t("止"),
  valueFormatter = next => formatCompactNumber(next, precisionFromStep(step)),
}) {
  return (
    <SliderField
      label={label}
      title={title}
      value={value}
      onChange={onChange}
      sliderMin={sliderMin}
      sliderMax={sliderMax}
      step={inputStep}
      min={inputMin}
      max={inputMax}
      startLabel={startLabel}
      endLabel={endLabel}
      valueFormatter={valueFormatter}
    />
  );
}

function ValueSliderField({ label, title, value, onChange, min, max, step = 1, valueFormatter = next => formatCompactNumber(next, precisionFromStep(step)) }) {
  return <SliderField label={label} title={title} value={value} onChange={onChange} sliderMin={min} sliderMax={max} step={step} min={min} max={max} valueFormatter={valueFormatter} />;
}

function AxisSlider({ axis, value, onChange }) {
  const axisLabel = axis.description ? <HelpLabel text={axis.label} title={axis.description} /> : axis.label;

  return (
    <Box className="axis-slider-card">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2" component="div">
          {axisLabel}
        </Typography>
        <Chip size="small" variant="outlined" label={axis.step >= 1 ? `${Math.round(Number(value))}` : Number(value).toFixed(2)} />
      </Stack>
      <SliderControl min={axis.min} max={axis.max} step={axis.step} value={value} onChange={next => onChange(Number(next))} />
    </Box>
  );
}

export { AxisSlider, HelpLabel, RangeField, ScriptActionButtonLabel, ScriptHotkeyItem, SelectField, SliderControl, TabPanel, ValueSliderField };
