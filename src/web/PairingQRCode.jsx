import React, { useMemo } from 'react';
import { t } from './i18n.js';
import { qrCodeImage } from './qr-code.js';

export default function PairingQRCode({ value }) {
  const code = useMemo(() => qrCodeImage(value), [value]);
  if (!code) return null;
  return <svg className="signal-pairing-code" viewBox={`0 0 ${code.size} ${code.size}`} role="img"
    aria-label={t('DG-LAB APP 配对二维码')} shapeRendering="crispEdges" data-testid="dglab-pairing-code">
    <rect width={code.size} height={code.size} fill="#fff" />
    <path d={code.path} fill="#000" />
  </svg>;
}
