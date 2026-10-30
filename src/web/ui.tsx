import React, { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { t } from './i18n.js';

export type ButtonTone = 'default' | 'primary' | 'danger' | 'danger-solid';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone; variant?: 'base' | 'outline' | 'text'; size?: 'small' | 'medium' | 'large';
}
export function Button({ children, tone = 'default', variant, size = 'medium', className = '', ...props }: ButtonProps) {
  const appearance = variant ?? (tone === 'primary' || tone === 'danger-solid' ? 'base' : tone === 'danger' ? 'text' : 'outline');
  return <button type="button" className={`button button--${tone} button--variant-${appearance} button--size-${size} ${className}`} {...props}>{children}</button>;
}
interface FieldLabel { label: ReactNode; hint?: string; className?: string; }
export type FieldProps = FieldLabel & (
  Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & { multiline?: false }
  | Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'> & { multiline: true }
);
export function Field(props: FieldProps) {
  const id = useId(), { label, hint, className = '' } = props;
  let control: ReactNode;
  if (props.multiline) {
    const { label: _label, hint: _hint, className: _className, multiline: _multiline, ...attributes } = props;
    control = <textarea id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...attributes} />;
  } else {
    const { label: _label, hint: _hint, className: _className, multiline: _multiline, ...attributes } = props;
    control = <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...attributes} />;
  }
  return <div className={`field ${className}`}><label className="field__label" htmlFor={id} title={hint}>{label}</label>{control}
    {hint && <span className="sr-only" id={`${id}-hint`}>{hint}</span>}</div>;
}
export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> {
  label: ReactNode; checked?: boolean | null; onChange(checked: boolean): void;
}
export function Toggle({ label, checked, onChange, disabled = false, role, ...props }: ToggleProps) {
  return <label className="toggle"><input type="checkbox" role={role} checked={Boolean(checked)}
    onChange={event => onChange(event.target.checked)} disabled={disabled} {...props} /><span>{label}</span></label>;
}
export type NoticeTone = 'default' | 'info' | 'warning' | 'error' | 'success';
export interface NoticeProps extends HTMLAttributes<HTMLDivElement> { tone?: NoticeTone; }
export function Notice({ children, tone = 'info', ...props }: NoticeProps) {
  return <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : undefined} {...props}>{children}</div>;
}
export function Badge({ children, tone = 'default' }: { children?: ReactNode; tone?: NoticeTone }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
export interface ModalProps {
  open: boolean; title: ReactNode; onClose(): void; children?: ReactNode; actions?: ReactNode;
  emergencyAction?: ReactNode; error?: string; wide?: boolean;
}
export function Modal({ open, title, onClose, children, actions, emergencyAction, error = '', wide = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) { dialog.showModal(); dialog.querySelector<HTMLElement>('.modal__close')?.focus(); }
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Native dialog backdrop click complements its Escape handler and trapped keyboard focus.
  return <dialog ref={ref} aria-labelledby={titleId} className={`modal${wide ? ' modal--wide' : ''}`}
    onKeyDown={event => {
      if (event.key !== 'Tab' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const dialog = event.currentTarget;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex]')]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]')
          && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible')
        .sort((left, right) => (left.tabIndex || Infinity) - (right.tabIndex || Infinity));
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      const active = dialog.ownerDocument.activeElement;
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <header className="modal__header"><h2 id={titleId}>{title}</h2><div className="modal__header-actions">{emergencyAction}
      <Button variant="text" className="modal__close" aria-label={t('关闭')} onClick={onClose}>
        <svg className="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </Button></div></header>
    <div className="modal__body">{open && error && <div className="modal__error"><Notice tone="error">{error}</Notice></div>}{open ? children : null}</div>
    {actions && <footer className="modal__actions">{actions}</footer>}
  </dialog>;
}
export interface SectionProps { title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; }
export function Section({ title, description, actions, children, className = '' }: SectionProps) {
  return <section className={`section ${className}`}><header className="section__header"><div><h2>{title}</h2>
    {description && <p className="muted">{description}</p>}</div>{actions && <div className="actions section__actions">{actions}</div>}</header>{children}</section>;
}
export interface TabOption<T extends string> { value: T; label: ReactNode; description?: ReactNode; icon?: ReactNode; }
export interface TabsProps<T extends string> {
  id?: string; label: string; value: T; onChange(value: T): void; options: readonly TabOption<T>[];
  variant?: 'line' | 'segmented' | 'workspace'; className?: string; orientation?: 'horizontal' | 'vertical';
}
export function Tabs<T extends string>({ id, label, value, onChange, options, variant = 'line', className = '', orientation = 'horizontal' }: TabsProps<T>) {
  return <div role="tablist" aria-label={label} aria-orientation={orientation} className={`tabs tabs--${variant} ${className}`}>
    {options.map((option, index) => <button key={option.value} type="button" role="tab" id={id ? `${id}-${option.value}` : undefined}
      aria-controls={id ? `${id}-panel` : undefined} aria-selected={value === option.value} tabIndex={value === option.value ? 0 : -1}
      onClick={() => onChange(option.value)} onKeyDown={event => {
        const forward = orientation === 'vertical' ? ['ArrowDown', 'ArrowRight'] : ['ArrowRight'];
        const backward = orientation === 'vertical' ? ['ArrowUp', 'ArrowLeft'] : ['ArrowLeft'];
        if (![...forward, ...backward, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 :
          (index + (forward.includes(event.key) ? 1 : -1) + options.length) % options.length;
        const next = options[nextIndex]; if (!next) return;
        onChange(next.value);
        const element = event.currentTarget.parentElement?.children.item(nextIndex);
        if (element instanceof HTMLElement) element.focus();
      }}>{option.icon && <span className="workspace-nav__icon" aria-hidden="true">{option.icon}</span>}
      <span className="tab-label">{option.label}{option.description && <small aria-hidden="true">{option.description}</small>}</span>
    </button>)}
  </div>;
}
