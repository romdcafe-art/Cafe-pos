/**
 * MENU.JS — หน้า Owner จัดการเมนู
 * Add / Edit / Change Price / Change Category / เปิด-ปิด Variant / Mark Sold Out / Active-Inactive
 * ไม่มีการลบเมนูจริง (ตามข้อกำหนด) — ใช้ Active/Inactive แทนเพื่อรักษาประวัติยอดขาย
 */

const CATEGORY_ORDER = ['Coffee', 'Tea', 'Soda', 'Smoothies', 'Food', 'Dessert', 'Other'];

let productsCache = [];
let editingProductId = null; // null = กำลังเพิ่มใหม่, ไม่ null = กำลังแก้ไข
let optionGroups = [];       // [{ name: 'ไข่', choices: ['ดาว','ต้ม','เจียว'] }, ...] — สำหรับเมนูที่ต้องเลือกก่อนสั่ง เช่น ชุดอาหารเช้า

async function initMenuPage() {
  // แสดงจาก Cache ก่อนทันที (ถ้ามี) เพื่อให้รู้สึกเร็วขึ้น ก่อนดึงข้อมูลสดมาทับ
  const cached = getCache('bootstrap', CACHE_TTL_MS);
  if (cached) {
    productsCache = cached.products;
    renderProducts();
  }

  await loadProducts();
  document.getElementById('btn-add-menu').addEventListener('click', () => openModal(null));
  document.getElementById('form-product').addEventListener('submit', handleFormSubmit);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('btn-add-option-group').addEventListener('click', () => {
    optionGroups.push({ name: '', choices: [] });
    renderOptionGroups();
  });
}

async function loadProducts() {
  try {
    const data = await callApi('getBootstrapData', {});
    setCache('bootstrap', data); // ให้หน้า POS ก็ได้ประโยชน์จาก Cache ที่สดขึ้นด้วย
    productsCache = data.products;
    renderProducts();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderProducts() {
  const container = document.getElementById('menu-list');
  container.innerHTML = '';

  if (productsCache.length === 0) {
    container.innerHTML = '<div class="empty-state">ยังไม่มีเมนู กด "+ Add Menu" เพื่อเริ่มเพิ่มเมนูแรกของร้าน</div>';
    return;
  }

  // จัดกลุ่มตาม Category ตามลำดับที่กำหนดไว้ (Category ที่ไม่อยู่ใน list จะต่อท้าย)
  const grouped = {};
  productsCache.forEach(p => {
    const cat = p.Category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  const orderedCats = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c))
  ];

  orderedCats.forEach(cat => {
    const block = document.createElement('div');
    block.className = 'category-block';

    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = cat;
    block.appendChild(title);

    grouped[cat]
      .sort((a, b) => (Number(a.Sort_Order) || 0) - (Number(b.Sort_Order) || 0))
      .forEach(p => block.appendChild(buildProductRow(p)));

    container.appendChild(block);
  });
}

function buildProductRow(p) {
  const row = document.createElement('div');
  const isActive = p.Active === true || p.Active === 'TRUE';
  const isSoldOut = p.Sold_Out === true || p.Sold_Out === 'TRUE';

  row.className = 'product-row' + (!isActive ? ' inactive' : '') + (isSoldOut ? ' sold-out' : '');

  const hasOptions = parseOptions(p.Options).length > 0;

  row.innerHTML = `
    <div class="product-info">
      <div class="product-name">${p.Thai_Name || p.English_Name}${p.Variant ? ' — ' + p.Variant : ''}${hasOptions ? ' <span class="options-badge">มีตัวเลือก</span>' : ''}</div>
      <div class="product-sub">${p.English_Name || ''}</div>
    </div>
    <div class="product-price">฿${Number(p.Price).toFixed(0)}</div>
    <div class="product-actions">
      <div class="toggle-wrap">
        <span>Sold Out</span>
        <div class="toggle amber ${isSoldOut ? 'on' : ''}" data-action="soldout" data-id="${p.Product_ID}"></div>
      </div>
      <div class="toggle-wrap">
        <span>Active</span>
        <div class="toggle ${isActive ? 'on' : ''}" data-action="active" data-id="${p.Product_ID}"></div>
      </div>
      <button class="btn-edit" data-action="edit" data-id="${p.Product_ID}">Edit</button>
    </div>
  `;

  row.querySelector('[data-action="soldout"]').addEventListener('click', () => handleToggleSoldOut(p));
  row.querySelector('[data-action="active"]').addEventListener('click', () => handleToggleActive(p));
  row.querySelector('[data-action="edit"]').addEventListener('click', () => openModal(p));

  return row;
}

async function handleToggleSoldOut(p) {
  const newVal = !(p.Sold_Out === true || p.Sold_Out === 'TRUE');
  try {
    await callApi('toggleSoldOut', { Product_ID: p.Product_ID, Sold_Out: newVal });
    p.Sold_Out = newVal;
    renderProducts();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleToggleActive(p) {
  const newVal = !(p.Active === true || p.Active === 'TRUE');
  try {
    await callApi('setProductActive', { Product_ID: p.Product_ID, Active: newVal });
    p.Active = newVal;
    renderProducts();
  } catch (err) {
    showToast(err.message, true);
  }
}

/* ---------- Option Groups (เช่น ชุดอาหารเช้า: เลือกไข่ + เลือกเครื่องดื่ม) ---------- */

/** แปลงค่าจาก Sheet (JSON string หรือค่าว่าง) เป็น array เสมอ กัน Error ถ้าข้อมูลเพี้ยน */
function parseOptions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function renderOptionGroups() {
  const container = document.getElementById('option-groups-list');
  container.innerHTML = '';

  optionGroups.forEach((group, index) => {
    const row = document.createElement('div');
    row.className = 'option-group-row';
    row.innerHTML = `
      <input type="text" class="og-name" placeholder="ชื่อกลุ่ม เช่น ไข่" value="${group.name || ''}">
      <input type="text" class="og-choices" placeholder="ตัวเลือก คั่นด้วยคอมม่า เช่น ดาว, ต้ม, เจียว" value="${(group.choices || []).join(', ')}">
      <button type="button" class="og-remove">✕</button>
    `;
    row.querySelector('.og-name').addEventListener('input', (e) => { optionGroups[index].name = e.target.value; });
    row.querySelector('.og-choices').addEventListener('input', (e) => {
      optionGroups[index].choices = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    });
    row.querySelector('.og-remove').addEventListener('click', () => {
      optionGroups.splice(index, 1);
      renderOptionGroups();
    });
    container.appendChild(row);
  });

  if (optionGroups.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:12px 0;">ไม่มีตัวเลือก (ถ้าเมนูนี้ต้องให้ลูกค้าเลือก เช่น ไข่/เครื่องดื่ม ค่อยกด + Add Option Group)</div>';
  }
}

/* ---------- Modal: Add / Edit ---------- */

function openModal(product) {
  editingProductId = product ? product.Product_ID : null;
  document.getElementById('modal-title').textContent = product ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่';

  document.getElementById('f-category').value = product ? product.Category : '';
  document.getElementById('f-thai-name').value = product ? product.Thai_Name : '';
  document.getElementById('f-english-name').value = product ? product.English_Name : '';
  document.getElementById('f-variant').value = product ? product.Variant : '';
  document.getElementById('f-price').value = product ? product.Price : '';

  optionGroups = product ? parseOptions(product.Options) : [];
  renderOptionGroups();

  document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  editingProductId = null;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-save-modal');
  submitBtn.disabled = true; // กันกดซ้ำ

  // ตัดกลุ่มที่ยังไม่ได้กรอกชื่อ หรือยังไม่มีตัวเลือกเลยทิ้ง กันข้อมูลเพี้ยน
  const cleanOptionGroups = optionGroups.filter(g => g.name && g.choices && g.choices.length > 0);

  const payload = {
    Category: document.getElementById('f-category').value.trim(),
    Thai_Name: document.getElementById('f-thai-name').value.trim(),
    English_Name: document.getElementById('f-english-name').value.trim(),
    Variant: document.getElementById('f-variant').value.trim(),
    Price: Number(document.getElementById('f-price').value),
    Options: cleanOptionGroups.length > 0 ? JSON.stringify(cleanOptionGroups) : ''
  };

  if (editingProductId) {
    payload.Product_ID = editingProductId;
    const existing = productsCache.find(p => p.Product_ID === editingProductId);
    payload.Active = existing.Active;
    payload.Sold_Out = existing.Sold_Out;
    payload.Sort_Order = existing.Sort_Order;
  }

  try {
    await callApi('saveProduct', payload);
    closeModal();
    await loadProducts();
    showToast('บันทึกเมนูเรียบร้อย');
  } catch (err) {
    showToast(err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
}

function showToast(message, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

document.addEventListener('DOMContentLoaded', initMenuPage);
