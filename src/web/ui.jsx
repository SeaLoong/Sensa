import React, { useEffect, useId, useRef } from 'react';
import { t } from './i18n.js';

export function Button({ children, tone = 'default', variant, size = 'medium', className = '', ...props }) {
  const appearance = variant ?? (tone === 'primary' || tone === 'danger-solid' ? 'base' : tone === 'danger' ? 'text' : 'outline');
  return (
    <button type="button" className={`button button--${tone} button--variant-${appearance} button--size-${size} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({ label, hint, className = '', multiline = false, ...props }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label className="field__label" htmlFor={id} title={hint}>
        {label}
      </label>
      {multiline ? <textarea id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} /> : <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />}
      {hint && <span className="sr-only" id={`${id}-hint`}>{hint}</span>}
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled = false, role, ...props }) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        role={role}
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

export function Notice({ children, tone = 'info', ...props }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : undefined} {...props}>
      {children}
    </div>
  );
}

export function Badge({ children, tone = 'default' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Modal({ open, title, onClose, children, actions, emergencyAction, error = '', wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('.modal__close')?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal${wide ? ' modal--wide' : ''}`}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const dialog = event.currentTarget;
        const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]')]
          .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled')
            && !element.closest('[inert]') && element.getClientRects().length > 0
            && getComputedStyle(element).visibility === 'visible')
          .sort((left, right) => (left.tabIndex || Infinity) - (right.tabIndex || Infinity));
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); return; }
        const active = dialog.ownerDocument.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header className="modal__header">
        <h2 id={titleId}>{title}</h2>
        <div className="modal__header-actions">
          {emergencyAction}
          <Button variant="text" className="modal__close" aria-label={t('关闭')} onClick={onClose}>
            <svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </Button>
        </div>
      </header>
      <div className="modal__body">
        {open && error && <div className="modal__error"><Notice tone="error">{error}</Notice></div>}
        {open ? children : null}
      </div>
      {actions && <footer className="modal__actions">{actions}</footer>}
    </dialog>
  );
}

export function Section({ title, description, actions, children, className = '' }) {
  return (
    <section className={`section ${className}`}>
      <header className="section__header">
        <div>
          <h2>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        {actions && <div className="actions section__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Tabs({ id, label, value, onChange, options, variant = 'line', className = '' }) {
  return (
    <div role="tablist" aria-label={label} className={`tabs tabs--${variant} ${className}`}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={id ? `${id}-${option.value}` : undefined}
          aria-controls={id ? `${id}-panel` : undefined}
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const offset = event.key === 'ArrowRight' ? 1 : -1;
            const nextIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : (index + offset + options.length) % options.length;
            onChange(options[nextIndex].value);
            event.currentTarget.parentElement.children[nextIndex]?.focus();
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
