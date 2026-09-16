/**
 * API.JS — จุดเดียวที่คุยกับ Apps Script Backend
 * แก้ APPS_SCRIPT_URL เป็น URL Web App ที่ Deploy จาก Apps Script ของคุณ
 */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzLQupT_YH18immkN7AE8F1rXG5QBvphnP74ppmgooZ1C8nEp_njmq4vP861Gcrmnjh/exec';

async function callApi(action, payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    // ใช้ text/plain เพื่อเลี่ยงปัญหา CORS preflight กับ Apps Script Web App
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });

  if (!res.ok) {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (HTTP ' + res.status + ')');
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
  }
  return json.data;
}

/** สร้าง Request ID ไว้ใช้เป็น Idempotency Key ป้องกันกดซ้ำ (Save / Payment) */
function newRequestId() {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
