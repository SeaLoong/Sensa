import React from 'react';
import { oscWorkflowHints } from './osc-workflow.js';
import { Notice } from './ui.jsx';

export default function OscFlowStatus(props) {
  const hints = oscWorkflowHints(props);
  return hints.length ? (
    <div className="stack">
      {hints.map((hint) => (
        <Notice key={hint.key} tone={hint.severity}>
          {hint.text}
        </Notice>
      ))}
    </div>
  ) : null;
}
