import { t } from './i18n.js';

// Script setup can take longer than an ordinary control request. Its independent
// HTTP request leaves the shared command socket available for stop and emergency.
export async function prepareDeviceScript(outputId, url, device = {}, {
  fetchRequest = globalThis.fetch, timers = globalThis, signal,
} = {}) {
  const preparationMs = Number(device.scriptTimeoutMs ?? 90000);
  if (!Number.isInteger(preparationMs) || preparationMs < 100 || preparationMs > 180000)
    throw new Error(t('脚本准备超时须为 100–180000 毫秒。'));
  const abort = new globalThis.AbortController();
  let expired = false;
  const cancel = () => abort.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = timers.setTimeout(() => { expired = true; abort.abort(); }, preparationMs + 5000);
  try {
    const response = await fetchRequest(`/api/control/output/${encodeURIComponent(outputId)}/script-prepare`, {
      method: 'POST', credentials: 'same-origin', redirect: 'error', signal: abort.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || t('同步脚本操作失败'));
    return data;
  } catch (error) {
    if (expired) throw new Error(t('同步脚本准备超时'));
    throw error;
  } finally {
    timers.clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
