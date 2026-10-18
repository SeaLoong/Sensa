import React, { useId, useRef } from 'react';
import { formatCompactNumber, normalizeRangePair, precisionFromStep } from './numeric.js';
import { t } from './i18n.js';

export function SelectField({ label, title, value, onChange, options, disabled = false, className = '' }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label className="field__label" id={`${id}-label`} htmlFor={id} title={title}>
        {label}
      </label>
      <select
        id={id}
        aria-labelledby={`${id}-label`}
        aria-describedby={title ? `${id}-hint` : undefined}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => {
          const option = (options || []).find((item) => String(item.value) === event.target.value);
          onChange(option ? option.value : event.target.value);
        }}
      >
        {(options || []).map((option) => (
          <option key={String(option.value)} value={option.value} disabled={Boolean(option.disabled)}>
            {option.label}
          </option>
        ))}
      </select>
      {title && <span className="sr-only" id={`${id}-hint`}>{title}</span>}
    </div>
  );
}

export function SliderControl({
  value,
  onChange,
  onChangeCommitted,
  valueFormatter = (next) => next,
  className = '',
  ...props
}) {
  const dirtyRef = useRef(false);
  const commit = (event) => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    onChangeCommitted?.(Number(event.currentTarget.value));
  };
  return (
    <input
      type="range"
      {...props}
      className={`slider-control ${className}`}
      value={value}
      aria-valuetext={String(valueFormatter(value))}
      onChange={(event) => {
        dirtyRef.current = true;
        onChange?.(Number(event.target.value));
      }}
      onPointerUp={commit}
      onKeyUp={(event) => {
        if (
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
        )
          commit(event);
      }}
      onBlur={commit}
    />
  );
}

export function ValueSliderField({
  label,
  title,
  value,
  onChange,
  onChangeCommitted,
  min,
  max,
  step = 1,
  valueFormatter = (next) => formatCompactNumber(next, precisionFromStep(step)),
  disabled = false,
}) {
  const id = useId();
  const numberDirtyRef = useRef(false);
  const normalize = (next) =>
    normalizeRangePair(next, next, { min, max, step, fallbackStart: value, fallbackEnd: value })[0];
  return (
    <div className="value-field">
      <div className="value-field__heading">
        <label htmlFor={id} title={title}>
          {label}
        </label>
        <output htmlFor={id}>{valueFormatter(value)}</output>
      </div>
      <div className="value-field__controls">
        <SliderControl
          id={id}
          aria-label={label}
          aria-describedby={title ? `${id}-hint` : undefined}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          valueFormatter={valueFormatter}
          onChange={(next) => onChange(normalize(next))}
          onChangeCommitted={(next) => onChangeCommitted?.(normalize(next))}
        />
        <input
          className="number-input"
          aria-label={t('{0}数值', [label])}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value !== '') {
              numberDirtyRef.current = true;
              onChange(normalize(Number(event.target.value)));
            }
          }}
          onBlur={() => {
            if (numberDirtyRef.current) {
              numberDirtyRef.current = false;
              onChangeCommitted?.(value);
            }
          }}
        />
      </div>
      {title && <span className="sr-only" id={`${id}-hint`}>{title}</span>}
    </div>
  );
}

export function RangeField({
  label,
  title,
  value,
  onChange,
  sliderMin,
  sliderMax,
  step = 1,
  inputStep = step,
  inputMin = sliderMin,
  inputMax = sliderMax,
  startLabel = t('起点'),
  endLabel = t('终点'),
  valueFormatter = (next) => formatCompactNumber(next, precisionFromStep(inputStep)),
}) {
  const update = (index, next) => {
    const pair = [...value];
    pair[index] = next;
    onChange(
      normalizeRangePair(pair[0], pair[1], {
        min: inputMin,
        max: inputMax,
        step: inputStep,
        fallbackStart: value[0],
        fallbackEnd: value[1],
      }),
    );
  };
  return (
    <fieldset className="range-field">
      <legend title={title}>
        {label}{' '}
        <span className="muted">
          {valueFormatter(value[0])} – {valueFormatter(value[1])}
        </span>
      </legend>
      <div className="range-field__inputs">
        {[startLabel, endLabel].map((name, index) => (
          <label key={index}>
            <span>{name}</span>
            <input
              type="number"
              aria-label={t('{0}{1}', [label, name])}
              min={inputMin}
              max={inputMax}
              step={inputStep}
              value={value[index]}
              onChange={(event) => {
                if (event.target.value !== '') update(index, Number(event.target.value));
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AxisSlider({ axis, value, onChange }) {
  return (
    <ValueSliderField
      label={axis.label}
      title={axis.description}
      value={value}
      min={axis.min}
      max={axis.max}
      step={axis.step}
      valueFormatter={(next) => (axis.step >= 1 ? Math.round(Number(next)) : Number(next).toFixed(2))}
      onChange={onChange}
    />
  );
}
