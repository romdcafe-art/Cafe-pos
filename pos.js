/**
 * POS.JS — หน้าแรก: แสดงผังที่นั่งทั้งหมด
 */

// แผนผังตำแหน่งที่นั่ง อ้างอิงจากผังร้านจริงที่วาดไว้
// (ถ้ามีที่นั่งอื่นเพิ่มในอนาคตที่ไม่อยู่ใน map นี้ จะไปแสดงในแถวเพิ่มเติมด้านล่างอัตโนมัติ)
const SEAT_LAYOUT_MAP = {
  'Table 1': 'seat-table1',
  'Table 2': 'seat-table2',
  'B1': 'seat-b1',
  'B2': 'seat-b2',
  'B3': 'seat-b3',
  'B4': 'seat-b4',
  'B5': 'seat-b5'
};

let bootstrapData = null;

async function initPos() {
  // 1) แสดงจาก Cache ก่อนทันที (ถ้ามี) เพื่อความรู้สึกเร็ว
  const cached = getCache('bootstrap', CACHE_TTL_MS);
  if (cached) {
    bootstrapData = cached;
    renderFloor();
  }

  // 2) แล้วดึงข้อมูลสดจริงมาทับ (สถานะที่นั่งต้องสดเสมอ)
  try {
    const fresh = await callApi('getBootstrapData', {});
    bootstrapData = fresh;
    setCache('bootstrap', fresh);
    renderFloor();
  } catch (err) {
    if (!cached) showToast(err.message, true);
  }
}

function renderFloor() {
  const floor = document.getElementById('floor');
  const extraRow = document.getElementById('seat-extra-row');
  floor.querySelectorAll('.seat-card').forEach(el => el.remove());
  extraRow.innerHTML = '';

  bootstrapData.seats.forEach(seat => {
    const card = buildSeatCard(seat);
    const areaClass = SEAT_LAYOUT_MAP[seat.Seat_Name];
    if (areaClass) {
      card.classList.add(areaClass);
      floor.appendChild(card);
    } else {
      extraRow.appendChild(card);
    }
  });
}

function buildSeatCard(seat) {
  const card = document.createElement('button');
  const isOccupied = seat.Status === 'Occupied';
  card.className = 'seat-card ' + (isOccupied ? 'occupied' : 'available');

  const openOrder = bootstrapData.openOrderBySeat[seat.Seat_Name];

  card.innerHTML = `
    <div class="seat-name">${seat.Seat_Name}</div>
    <div class="seat-status">${isOccupied ? 'Occupied' : 'Available'}</div>
    ${isOccupied && openOrder ? `
      <div class="seat-amount">฿${Number(openOrder.Total).toFixed(0)}</div>
      <div class="seat-status">${openOrder.ItemCount} Items</div>
    ` : ''}
  `;

  card.addEventListener('click', () => {
    window.location.href = 'order.html?seat=' + encodeURIComponent(seat.Seat_Name);
  });

  return card;
}

async function handleTakeAway() {
  const btn = document.getElementById('btn-take-away');
  btn.disabled = true; // กันกดซ้ำระหว่างรอ Order Number จากเซิร์ฟเวอร์
  try {
    const result = await callApi('createTakeAway', {});
    window.location.href = 'order.html?type=TakeAway&orderNumber=' + encodeURIComponent(result.Order_Number);
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
  }
}

function showToast(message, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

document.addEventListener('DOMContentLoaded', () => {
  initPos();
  document.getElementById('btn-take-away').addEventListener('click', handleTakeAway);
  // Poll สถานะที่นั่งทุก 8 วิ ให้หน้าจอสดตลอดเวลาแม้ไม่มีคน refresh
  setInterval(async () => {
    try {
      const fresh = await callApi('getBootstrapData', {});
      bootstrapData = fresh;
      setCache('bootstrap', fresh);
      renderFloor();
    } catch (e) { /* เงียบไว้ ไม่รบกวนหน้าจอถ้า poll พลาดครั้งเดียว */ }
  }, 8000);
});
