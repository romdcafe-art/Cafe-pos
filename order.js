/**
 * ORDER.JS — หน้ารับ Order (Dine In / Bar / Take Away)
 * Flow: Select Menu → Add to Order → Save Order → Payment → Print Receipt
 */

let mode = null;           // 'seat' | 'takeaway'
let seatName = null;
let orderId = null;        // null จนกว่าจะ Save ครั้งแรกสำเร็จ (ป้องกันสร้าง Order ซ้ำ)
let orderNumber = null;
let createdAt = null;
let products = [];
let currentCategory = null;
let cart = [];             // [{ Product_ID, Product_Name, Variant, Quantity, Unit_Price, Note }]
let discount = 0;
let selectedPaymentMethod = null;
let shopSettings = {};

function draftKey() {
  return mode === 'seat' ? 'seat_' + seatName : 'takeaway_' + orderNumber;
}

async function initOrderPage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('seat')) {
    mode = 'seat';
    seatName = params.get('seat');
  } else if (params.get('type') === 'TakeAway') {
    mode = 'takeaway';
    orderNumber = params.get('orderNumber');
  } else {
    // เข้ามาผิดทาง ไม่มีที่นั่งหรือ Take Away number ระบุ กลับหน้า POS
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('order-title').textContent =
    mode === 'seat' ? seatName : 'Take Away ' + orderNumber;

  try {
    const data = await callApi('getBootstrapData', {});
    products = data.products;
    shopSettings = {};
    (data.settings || []).forEach(s => shopSettings[s.Key] = s.Value);

    // โหลด Order เดิม ถ้าที่นั่งนี้กำลัง Occupied อยู่ (กันไม่ให้สร้างบิลใหม่ซ้อน)
    if (mode === 'seat' && data.openOrderBySeat[seatName]) {
      await loadExistingOrder();
    } else {
      restoreDraftIfAny();
    }
  } catch (err) {
    showToast(err.message, true);
  }

  const categories = [...new Set(products.map(p => p.Category))];
  currentCategory = categories[0];
  renderCategoryTabs(categories);
  renderMenuGrid();
  renderCart();

  document.getElementById('btn-save-order').addEventListener('click', handleSaveOrder);
  document.getElementById('btn-payment').addEventListener('click', openPaymentModal);
  document.getElementById('discount-input').addEventListener('input', (e) => {
    discount = Number(e.target.value) || 0;
    saveDraft();
    renderTotals();
  });

  setupPaymentModalEvents();
}

async function loadExistingOrder() {
  try {
    const result = await callApi('getOrder', { Seat: seatName });
    if (result && result.order) {
      orderId = result.order.Order_ID;
      orderNumber = result.order.Order_Number;
      createdAt = result.order.Created_At;
      discount = Number(result.order.Discount) || 0;
      cart = result.items.map(it => ({
        Product_ID: it.Product_ID,
        Product_Name: it.Product_Name,
        Variant: it.Variant,
        Quantity: Number(it.Quantity),
        Unit_Price: Number(it.Unit_Price),
        Note: it.Note || ''
      }));
      document.getElementById('discount-input').value = discount;
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

function restoreDraftIfAny() {
  const draft = loadDraftOrder(draftKey());
  if (draft) {
    cart = draft.cart || [];
    discount = draft.discount || 0;
    document.getElementById('discount-input').value = discount;
  }
}

function saveDraft() {
  saveDraftOrder(draftKey(), { cart, discount });
}

/* ---------- Menu rendering ---------- */

function renderCategoryTabs(categories) {
  const wrap = document.getElementById('category-tabs');
  wrap.innerHTML = '';
  categories.forEach(cat => {
    const tab = document.createElement('button');
    tab.className = 'cat-tab' + (cat === currentCategory ? ' active' : '');
    tab.textContent = cat;
    tab.addEventListener('click', () => {
      currentCategory = cat;
      renderCategoryTabs(categories);
      renderMenuGrid();
    });
    wrap.appendChild(tab);
  });
}

function renderMenuGrid() {
  const grid = document.getElementById('menu-grid');
  grid.innerHTML = '';
  const isActive = p => p.Active === true || p.Active === 'TRUE';
  const isSoldOut = p => p.Sold_Out === true || p.Sold_Out === 'TRUE';

  products
    .filter(p => p.Category === currentCategory && isActive(p))
    .forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'menu-btn' + (isSoldOut(p) ? ' sold-out' : '');
      btn.innerHTML = `
        <div class="name">${p.Thai_Name || p.English_Name}</div>
        ${p.Variant ? `<div class="variant">${p.Variant}</div>` : ''}
        <div class="price">฿${Number(p.Price).toFixed(0)}</div>
      `;
      btn.disabled = isSoldOut(p);
      btn.addEventListener('click', () => addToCart(p));
      grid.appendChild(btn);
    });
}

/* ---------- Cart ---------- */

function addToCart(product) {
  const existing = cart.find(it => it.Product_ID === product.Product_ID && !it.Note);
  if (existing) {
    existing.Quantity += 1;
  } else {
    cart.push({
      Product_ID: product.Product_ID,
      Product_Name: (product.Thai_Name || product.English_Name) + (product.Variant ? ' (' + product.Variant + ')' : ''),
      Variant: product.Variant || '',
      Quantity: 1,
      Unit_Price: Number(product.Price),
      Note: ''
    });
  }
  saveDraft();
  renderCart();
}

function changeQuantity(index, delta) {
  cart[index].Quantity += delta;
  if (cart[index].Quantity <= 0) cart.splice(index, 1);
  saveDraft();
  renderCart();
}

function removeItem(index) {
  cart.splice(index, 1);
  saveDraft();
  renderCart();
}

function updateNote(index, value) {
  cart[index].Note = value;
  saveDraft();
}

function renderCart() {
  const container = document.getElementById('cart-lines');
  container.innerHTML = '';

  if (cart.length === 0) {
    container.innerHTML = '<div class="empty-state">ยังไม่มีรายการ เลือกเมนูด้านซ้ายเพื่อเริ่มสั่ง</div>';
  }

  cart.forEach((item, index) => {
    const line = document.createElement('div');
    line.className = 'order-line';
    line.innerHTML = `
      <div class="order-line-info">
        <div class="order-line-name">${item.Product_Name} ×${item.Quantity}</div>
        <input type="text" class="order-line-note-input" placeholder="Note (ถ้ามี)" value="${item.Note || ''}">
      </div>
      <div class="qty-stepper">
        <button class="qty-btn" data-act="minus">−</button>
        <span class="qty-value">${item.Quantity}</span>
        <button class="qty-btn" data-act="plus">+</button>
      </div>
      <div class="order-line-total">฿${(item.Unit_Price * item.Quantity).toFixed(0)}</div>
      <button class="order-line-remove">✕</button>
    `;
    line.querySelector('[data-act="minus"]').addEventListener('click', () => changeQuantity(index, -1));
    line.querySelector('[data-act="plus"]').addEventListener('click', () => changeQuantity(index, 1));
    line.querySelector('.order-line-remove').addEventListener('click', () => removeItem(index));
    line.querySelector('.order-line-note-input').addEventListener('input', (e) => updateNote(index, e.target.value));
    container.appendChild(line);
  });

  renderTotals();
}

function calcSubtotal() {
  return cart.reduce((s, it) => s + it.Unit_Price * it.Quantity, 0);
}

function renderTotals() {
  const subtotal = calcSubtotal();
  const total = Math.max(0, subtotal - discount);
  document.getElementById('subtotal-value').textContent = '฿' + subtotal.toFixed(0);
  document.getElementById('total-value').textContent = '฿' + total.toFixed(0);
}

/* ---------- Save Order ---------- */

async function handleSaveOrder() {
  if (cart.length === 0) {
    showToast('ยังไม่มีรายการสั่ง', true);
    return;
  }
  const btn = document.getElementById('btn-save-order');
  btn.disabled = true; // กันกดซ้ำ
  try {
    const result = await callApi('saveOrder', {
      Order_ID: orderId,
      Order_Number: orderNumber,
      Order_Type: mode === 'seat' ? 'DineIn' : 'TakeAway',
      Seat: mode === 'seat' ? seatName : '',
      Created_At: createdAt,
      Discount: discount,
      items: cart
    });
    orderId = result.Order_ID;
    orderNumber = result.Order_Number;
    clearDraftOrder(draftKey());
    clearCache('bootstrap'); // สถานะที่นั่งเปลี่ยนไปแล้ว ให้หน้า POS โหลดสดรอบหน้า
    showToast('บันทึก Order เรียบร้อย');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Payment ---------- */

function openPaymentModal() {
  if (cart.length === 0) {
    showToast('ยังไม่มีรายการสั่ง', true);
    return;
  }
  if (!orderId) {
    showToast('กรุณา Save Order ก่อนไปหน้า Payment', true);
    return;
  }
  selectedPaymentMethod = null;
  document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('cash-fields').style.display = 'none';
  document.getElementById('cash-received-input').value = '';
  document.getElementById('change-display').textContent = '';
  document.getElementById('payment-total-value').textContent = document.getElementById('total-value').textContent;
  document.getElementById('payment-modal-overlay').classList.add('show');
}

function closePaymentModal() {
  document.getElementById('payment-modal-overlay').classList.remove('show');
}

function setupPaymentModalEvents() {
  document.querySelectorAll('.payment-method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPaymentMethod = btn.dataset.method;
      document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('cash-fields').style.display = selectedPaymentMethod === 'CASH' ? 'block' : 'none';
    });
  });

  document.getElementById('cash-received-input').addEventListener('input', (e) => {
    const received = Number(e.target.value) || 0;
    const total = Math.max(0, calcSubtotal() - discount);
    const change = Math.max(0, received - total);
    document.getElementById('change-display').textContent = 'เงินทอน ฿' + change.toFixed(0);
  });

  document.getElementById('btn-cancel-payment').addEventListener('click', closePaymentModal);
  document.getElementById('btn-confirm-payment').addEventListener('click', handleConfirmPayment);
  document.getElementById('btn-print-again').addEventListener('click', () => {
    markReceiptAsCopy();
    window.print();
  });
  document.getElementById('btn-back-to-pos').addEventListener('click', () => window.location.href = 'index.html');
}

let receiptAlreadyPrinted = false;

function markReceiptAsCopy() {
  // พิมพ์ครั้งแรกไม่ต้องมีคำว่า COPY ครั้งถัดไป (กด Print Again) ต้องมี เพื่อกันความสับสน
  if (receiptAlreadyPrinted) {
    const area = document.getElementById('receipt-print-area');
    if (!area.querySelector('.receipt-copy-badge')) {
      area.insertAdjacentHTML('afterbegin', '<div class="receipt-copy-badge">COPY</div>');
    }
  }
  receiptAlreadyPrinted = true;
}

async function handleConfirmPayment() {
  if (!selectedPaymentMethod) {
    showToast('กรุณาเลือกวิธีชำระเงิน', true);
    return;
  }
  const total = Math.max(0, calcSubtotal() - discount);
  const cashReceived = Number(document.getElementById('cash-received-input').value) || 0;
  if (selectedPaymentMethod === 'CASH' && cashReceived < total) {
    showToast('รับเงินไม่พอ กรุณาตรวจสอบยอด', true);
    return;
  }

  const btn = document.getElementById('btn-confirm-payment');
  btn.disabled = true; // กันกด Confirm ซ้ำ — สำคัญมากเพื่อไม่ให้เกิด Payment ซ้ำ
  try {
    const result = await callApi('confirmPayment', {
      Order_ID: orderId,
      Payment_Method: selectedPaymentMethod,
      Cash_Received: cashReceived
    });
    clearCache('bootstrap');
    renderReceipt(result);
    closePaymentModal();
    showReceiptScreen();
  } catch (err) {
    showToast(err.message, true);
    btn.disabled = false;
  }
}

/* ---------- Receipt ---------- */

function renderReceipt(paymentResult) {
  const subtotal = calcSubtotal();
  const shopName = shopSettings['Shop Name'] || 'Coffee Shop';
  const now = new Date();

  let itemsHtml = cart.map(it => `
    <div class="receipt-line"><span>${it.Product_Name} x${it.Quantity}</span><span>฿${(it.Unit_Price * it.Quantity).toFixed(0)}</span></div>
    ${it.Note ? `<div style="font-size:11px;color:#555;">- ${it.Note}</div>` : ''}
  `).join('');

  document.getElementById('receipt-print-area').innerHTML = `
    <div class="receipt-center"><strong>${shopName}</strong></div>
    <div class="receipt-center">${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH')}</div>
    <div class="receipt-divider"></div>
    <div>${mode === 'seat' ? seatName : 'Take Away ' + orderNumber}</div>
    <div class="receipt-divider"></div>
    ${itemsHtml}
    <div class="receipt-divider"></div>
    <div class="receipt-line"><span>Subtotal</span><span>฿${subtotal.toFixed(0)}</span></div>
    <div class="receipt-line"><span>Discount</span><span>฿${discount.toFixed(0)}</span></div>
    <div class="receipt-line"><strong>Total</strong><strong>฿${Number(paymentResult.Total).toFixed(0)}</strong></div>
    <div class="receipt-divider"></div>
    <div>Payment: ${selectedPaymentMethod}</div>
    ${selectedPaymentMethod === 'CASH' ? `
      <div class="receipt-line"><span>Cash Received</span><span>฿${Number(document.getElementById('cash-received-input').value || 0).toFixed(0)}</span></div>
      <div class="receipt-line"><span>Change</span><span>฿${Number(paymentResult.Change || 0).toFixed(0)}</span></div>
    ` : ''}
    <div class="receipt-divider"></div>
    <div class="receipt-center">Thank You</div>
  `;
}

function showReceiptScreen() {
  document.getElementById('order-main').style.display = 'none';
  document.getElementById('receipt-success-screen').style.display = 'block';
  markReceiptAsCopy(); // ครั้งแรกจะยังไม่ติด COPY (ตั้ง flag ไว้สำหรับครั้งถัดไป)
  window.print();
}

function showToast(message, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

document.addEventListener('DOMContentLoaded', initOrderPage);
