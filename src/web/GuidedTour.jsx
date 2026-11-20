import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tourLayout, tourTarget } from './tour-layout.js';
import { t } from './i18n.js';

// The target remains interactive. Native editors appear above this layer and
// suspend the tour until closed; advancing never writes runtime configuration.
export default function GuidedTour({ step, goal, workspace, targetSelector, suspended, onDismiss, emergencyAction, children }) {
  const cardRef = useRef(null), dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const [layout, setLayout] = useState(null);
  useEffect(() => {
    if (suspended) return undefined;
    let frame = 0, target = null, navigation = null, scrolled = false;
    const previousFocus = document.activeElement;
    const selector = targetSelector || tourTarget(step, goal);
    const update = () => {
      frame = 0;
      // Output telemetry can fill the viewport. Keep the connection actions
      // reachable instead of placing instructions over an entire output card.
      target = step === 'device' ? document.querySelector('.outputs-section .output-card .output-actions') || document.querySelector(selector) : selector ? document.querySelector(selector) : null;
      const disclosure = target?.closest('details');
      if (disclosure) disclosure.open = true;
      if (target && !scrolled) {
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
        scrolled = true;
      }
      const bounds = target?.getBoundingClientRect();
      navigation = document.getElementById(`workspace-tabs-${workspace}`);
      const navigationBounds = navigation?.getBoundingClientRect();
      const card = cardRef.current;
      const content = card?.querySelector('.onboarding-panel__content');
      const naturalHeight = (content?.scrollHeight || 240)
        + (card?.querySelector('.onboarding-panel__footer')?.offsetHeight || 60)
        + (card?.querySelector('.guided-tour__emergency')?.offsetHeight || 60);
      const next = tourLayout(bounds?.width && bounds?.height ? bounds : null,
        { width: window.innerWidth, height: window.innerHeight },
        { width: step === 'goal' ? 560 : 380, height: naturalHeight },
        navigationBounds?.width && navigationBounds?.height ? navigationBounds : null);
      setLayout(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const keydown = event => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); dismissRef.current(); return; }
      if (event.key !== 'Tab') return;
      const roots = [cardRef.current, navigation, target].filter(Boolean);
      const selector = 'button, input, select, textarea, a[href], summary, [tabindex]';
      const controls = [...new Set(roots.flatMap(root => [
        ...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector),
      ]))]
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length);
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement);
      event.preventDefault();
      const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      controls[next].focus();
    };
    const observer = new window.MutationObserver(schedule);
    observer.observe(document.querySelector('.app-shell'), { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    if (cardRef.current) resize.observe(cardRef.current);
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    document.addEventListener('keydown', keydown);
    update();
    if (previousFocus?.closest?.('.workspace-nav')) navigation?.focus({ preventScroll: true });
    else cardRef.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
      document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
      document.removeEventListener('keydown', keydown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [step, goal, workspace, suspended, targetSelector]);
  if (suspended || typeof document === 'undefined') return null;
  const target = layout?.target;
  const masks = layout?.shades || (target ? [
    { left: 0, top: 0, width: '100%', height: target.top },
    { left: 0, top: target.top, width: target.left, height: target.height },
    { left: target.left + target.width, top: target.top, right: 0, height: target.height },
    { left: 0, top: target.top + target.height, width: '100%', bottom: 0 },
  ] : [{ inset: 0 }]);
  return createPortal(<div className="guided-tour" data-testid="guided-tour" data-step={step}>
    {masks.map((style, index) => <div key={index} className="guided-tour__shade" style={style} aria-hidden="true" />)}
    {target && <div className="guided-tour__target" data-testid="tour-highlight" style={target} aria-hidden="true" />}
    {layout?.navigation && <div className="guided-tour__target" data-testid="tour-navigation-highlight" data-workspace={workspace} style={layout.navigation} aria-hidden="true" />}
    <div ref={cardRef} className="guided-tour__card" role="dialog" aria-label={t('操作引导')} tabIndex={-1}
      style={layout?.card || { visibility: 'hidden' }}>
      {children}<div className="guided-tour__emergency">{emergencyAction}</div>
    </div>
  </div>, document.body);
}
