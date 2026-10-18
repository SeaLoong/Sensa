import { t } from './i18n.js';
const order=['L0','L1','L2','R0','R1','R2','V0','V1','V2','A0','A1','A2'];
export function outputPreview(state) {
  const telemetry=state?.telemetry;
  const phase=!state?.enabled?'disabled':!state?.connected?'disconnected':telemetry?.state||'idle';
  const labels={disabled:t("已禁用"),disconnected:t("未连接"),idle:t("等待发送"),sent:t("最近发送目标"),stopped:t("已请求停止"),error:t("发送异常")};
  const targets=(telemetry?.targets||[]).filter(t=>Number.isFinite(t.value)&&Number.isFinite(t.maximum)&&t.maximum>0)
    .map(t=>({...t,percent:Math.max(0,Math.min(100,t.value/t.maximum*100))}))
    .sort((a,b)=>(order.includes(a.key)?order.indexOf(a.key):99)-(order.includes(b.key)?order.indexOf(b.key):99)||a.key.localeCompare(b.key));
  return {phase,label:labels[phase]||t("等待发送"),targets,lastSentAtUtc:telemetry?.lastSentAtUtc||null};
}
