(async function () {
  const $ = (id) => document.getElementById(id);

  let c;
  try {
    const res = await fetch('/api/content');
    c = await res.json();
  } catch {
    return;
  }

  document.title = c.siteName;
  $('site-name').textContent = c.siteName;
  $('tagline').textContent = c.tagline || '';
  $('tagline').hidden = !c.tagline;

  // Meta Pixel (only when a Pixel ID is saved in admin)
  const pixelId = c.tracking && c.tracking.metaPixelId;
  if (pixelId) {
    const s = document.createElement('script');
    s.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;
n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');`;
    document.head.appendChild(s);
  }

  // Images, each followed by its own words section
  const blocks = $('blocks');
  c.blocks.forEach((b) => {
    const fig = document.createElement('figure');
    fig.className = 'product-block';
    const img = document.createElement('img');
    img.src = b.src;
    img.alt = b.alt || '';
    img.loading = 'lazy';
    fig.appendChild(img);
    blocks.appendChild(fig);

    if (b.text) {
      const words = document.createElement('div');
      words.className = 'block-text';
      words.textContent = b.text;
      blocks.appendChild(words);
    }
  });

  // Order form
  $('order-title').textContent = c.orderForm.title;
  $('order-button').textContent = c.orderForm.buttonLabel;
  const select = $('product-select');
  c.orderForm.products.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  });

  // Words after the form, and footer
  $('closing-text').textContent = c.closingText;
  $('closing-text').hidden = !c.closingText;
  $('footer-text').textContent = c.footer.text;
  $('footer-contact').textContent = c.footer.contact;

  // Submit order
  $('order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = $('order-message');
    const btn = $('order-button');
    const data = Object.fromEntries(new FormData(form).entries());

    btn.disabled = true;
    msg.textContent = '';
    msg.className = 'message';
    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      if (typeof window.fbq === 'function') {
        window.fbq('track', 'Lead', { content_name: data.product, value: Number(data.quantity) });
      }
      form.reset();
      msg.textContent = out.message;
      msg.className = 'message success';
    } catch (err) {
      msg.textContent = err.message || 'Could not send your order. Please try again.';
      msg.className = 'message error';
    } finally {
      btn.disabled = false;
    }
  });
})();
