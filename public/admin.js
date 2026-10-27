(function () {
  const $ = (id) => document.getElementById(id);
  let content = null;

  // ---------- helpers ----------

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  // Creates an element. Text goes in with textContent, so nothing is parsed as HTML.
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (v === false || v === null || v === undefined) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'value') node.value = v;
      else if (k === 'on') Object.entries(v).forEach(([ev, fn]) => node.addEventListener(ev, fn));
      else if (k === 'disabled') node.disabled = true;
      else if (k === 'selected') node.selected = true;
      else node.setAttribute(k, v === true ? '' : v);
    });
    children.forEach((c) => node.appendChild(c));
    return node;
  }

  function newId() {
    return 'b' + Math.random().toString(36).slice(2, 10);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFile(file) {
    if (file.size > 8 * 1024 * 1024) throw new Error('Image is larger than 8 MB.');
    const dataUrl = await readFile(file);
    const out = await api('/api/admin/upload', { method: 'POST', body: { data: dataUrl } });
    return out.url;
  }

  function flash(node, msg, ok) {
    node.textContent = msg;
    node.className = ok === null ? 'hint' : 'message ' + (ok ? 'success' : 'error');
  }

  // ---------- login ----------

  function showLogin() {
    $('login-panel').hidden = false;
    $('admin-panel').hidden = true;
    $('logout').hidden = true;
  }

  function showAdmin() {
    $('login-panel').hidden = true;
    $('admin-panel').hidden = false;
    $('logout').hidden = false;
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = e.target.password.value;
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: pw } });
      e.target.password.value = '';
      $('login-error').textContent = '';
      await start();
    } catch (err) {
      $('login-error').textContent = err.message;
    }
  });

  $('logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  });

  // ---------- form <-> content ----------

  function fillForm() {
    $('site-name-input').value = content.siteName;
    $('tagline-input').value = content.tagline || '';
    $('of-title').value = content.orderForm.title;
    $('of-button').value = content.orderForm.buttonLabel;
    $('of-products').value = content.orderForm.products.join('\n');
    $('of-success').value = content.orderForm.successMessage;
    $('closing').value = content.closingText;
    $('footer-text').value = content.footer.text;
    $('footer-contact').value = content.footer.contact;
    $('notify-email').value = content.notifications.email || '';
    $('pixel-id').value = content.tracking.metaPixelId || '';
    renderBlocks();
  }

  function collectForm() {
    content.siteName = $('site-name-input').value;
    content.tagline = $('tagline-input').value;
    content.orderForm = {
      title: $('of-title').value,
      buttonLabel: $('of-button').value,
      products: $('of-products').value.split('\n').map((s) => s.trim()).filter(Boolean),
      successMessage: $('of-success').value,
    };
    content.closingText = $('closing').value;
    content.footer = {
      text: $('footer-text').value,
      contact: $('footer-contact').value,
    };
    content.notifications = { email: $('notify-email').value.trim() };
    content.tracking = { metaPixelId: $('pixel-id').value.trim() };
  }

  async function saveAll(okMsg) {
    const status = $('save-status');
    try {
      collectForm();
      content = await api('/api/admin/content', { method: 'PUT', body: content });
      fillForm();
      flash(status, okMsg, true);
    } catch (err) {
      flash(status, err.message, false);
    }
  }

  // ---------- image blocks ----------

  function renderBlocks() {
    const list = $('block-list');
    list.textContent = '';

    if (!content.blocks.length) {
      list.appendChild(el('p', { class: 'hint', text: 'No images yet.' }));
      return;
    }

    content.blocks.forEach((b, i) => {
      const card = el('div', { class: 'block-card' }, [
        el('img', { class: 'thumb', src: b.src, alt: '' }),
        el('div', { class: 'block-fields' }, [
          el('label', {}, [
            document.createTextNode('Image description (alt text)'),
            el('input', {
              type: 'text',
              maxlength: '200',
              value: b.alt || '',
              on: { input: (e) => { b.alt = e.target.value; } },
            }),
          ]),
          el('label', {}, [
            document.createTextNode('Words under this image'),
            el('textarea', {
              rows: '4',
              maxlength: '5000',
              value: b.text || '',
              on: { input: (e) => { b.text = e.target.value; } },
            }),
          ]),
          el('div', { class: 'row' }, [
            el('button', {
              type: 'button',
              class: 'small',
              disabled: i === 0,
              text: 'Move up',
              on: {
                click: () => {
                  collectForm();
                  [content.blocks[i - 1], content.blocks[i]] = [content.blocks[i], content.blocks[i - 1]];
                  renderBlocks();
                },
              },
            }),
            el('button', {
              type: 'button',
              class: 'small',
              disabled: i === content.blocks.length - 1,
              text: 'Move down',
              on: {
                click: () => {
                  collectForm();
                  [content.blocks[i + 1], content.blocks[i]] = [content.blocks[i], content.blocks[i + 1]];
                  renderBlocks();
                },
              },
            }),
            el('label', { class: 'small-file' }, [
              document.createTextNode('Replace image '),
              el('input', {
                type: 'file',
                accept: 'image/png,image/jpeg,image/webp,image/gif',
                on: {
                  change: async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                      b.src = await uploadFile(file);
                      await saveAll('Image replaced and saved.');
                    } catch (err) {
                      alert(err.message);
                    }
                  },
                },
              }),
            ]),
            el('button', {
              type: 'button',
              class: 'small danger',
              text: 'Remove',
              on: {
                click: async () => {
                  if (!confirm('Remove this image and its words?')) return;
                  collectForm();
                  content.blocks.splice(i, 1);
                  await saveAll('Image removed and saved.');
                },
              },
            }),
          ]),
        ]),
      ]);
      list.appendChild(card);
    });
  }

  $('add-block').addEventListener('click', async () => {
    const file = $('new-image').files[0];
    if (!file) return alert('Choose an image first.');
    const btn = $('add-block');
    btn.disabled = true;
    try {
      const url = await uploadFile(file);
      collectForm();
      content.blocks.push({ id: newId(), src: url, alt: '', text: $('new-text').value });
      $('new-image').value = '';
      $('new-text').value = '';
      await saveAll('Image added and saved.');
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $('save').addEventListener('click', () => saveAll('Saved.'));

  // ---------- email test ----------

  $('test-email').addEventListener('click', async () => {
    const status = $('email-status');
    const btn = $('test-email');
    btn.disabled = true;
    flash(status, 'Sending...', null);
    try {
      collectForm();
      await api('/api/admin/content', { method: 'PUT', body: content });
      const out = await api('/api/admin/test-email', { method: 'POST' });
      flash(status, 'Test sent to ' + out.to + '. Check the inbox (and spam).', true);
    } catch (err) {
      flash(status, err.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- orders ----------

  async function loadOrders() {
    const orders = await api('/api/admin/orders');
    const box = $('orders');
    box.textContent = '';

    if (!orders.length) {
      box.appendChild(el('p', { class: 'hint', text: 'No orders yet.' }));
      return;
    }

    orders.forEach((o) => {
      const statusSelect = el(
        'select',
        {
          on: {
            change: async (e) => {
              await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { status: e.target.value } });
            },
          },
        },
        ['new', 'contacted', 'delivered', 'cancelled'].map((s) =>
          el('option', { value: s, text: s, selected: s === o.status })
        )
      );

      box.appendChild(
        el('div', { class: 'order-card' }, [
          el('p', { class: 'hint', text: new Date(o.createdAt).toLocaleString() }),
          el('p', { text: `${o.name} · ${o.phone}` }),
          el('p', { text: `${o.quantity} × ${o.product}` }),
          el('p', { text: o.address }),
          o.note ? el('p', { text: `Note: ${o.note}` }) : el('span'),
          el('div', { class: 'row' }, [
            statusSelect,
            el('button', {
              type: 'button',
              class: 'small danger',
              text: 'Delete',
              on: {
                click: async () => {
                  if (!confirm('Delete this order?')) return;
                  await api(`/api/admin/orders/${o.id}`, { method: 'DELETE' });
                  loadOrders();
                },
              },
            }),
          ]),
        ])
      );
    });
  }

  // ---------- start ----------

  async function start() {
    let session;
    try {
      session = await api('/api/admin/session');
    } catch {
      return showLogin();
    }
    content = await api('/api/admin/content');
    showAdmin();
    fillForm();
    flash($('email-status'), session.emailReady ? 'Gmail is connected on the server.' : 'Gmail is not set up on the server yet. Add GMAIL_USER and GMAIL_APP_PASSWORD.', null);
    await loadOrders();
  }

  start();
})();
