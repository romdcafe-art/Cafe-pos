/**
 * CACHE.JS
 * - Cache เมนู/ที่นั่ง ไว้ชั่วคราว ลดการเรียก Apps Script ซ้ำ ๆ
 * - เก็บ Draft Order ระหว่างสั่ง กัน Order หายเมื่อ Refresh หน้าเว็บ
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 นาที

function setCache(key, value) {
  localStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }));
}

function getCache(key, ttlMs) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (ttlMs && (Date.now() - parsed.savedAt > ttlMs)) return null;
    return parsed.value;
  } catch (e) {
    return null;
  }
}

function clearCache(key) {
  localStorage.removeItem(key);
}

/* ---- Draft order (กันของหายตอน Refresh) ---- */
function saveDraftOrder(seatKey, draft) {
  setCache('draft_' + seatKey, draft);
}
function loadDraftOrder(seatKey) {
  return getCache('draft_' + seatKey, null); // ไม่หมดอายุ จนกว่าจะ Save สำเร็จ
}
function clearDraftOrder(seatKey) {
  clearCache('draft_' + seatKey);
}
