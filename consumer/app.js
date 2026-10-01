// Example consumer of the Restaurant API (README, Example consumer). Plain browser JavaScript:
// browse restaurants, read a menu, place an order, track it. Everything goes through callApi(),
// which understands the API's envelope, its errors, and 429 + Retry-After.
//
// Which API: the live one by default, or ?api=http://localhost:3002 to try a local server.

const LIVE_API = 'https://restaurant-api-iota-eight.vercel.app';
const API_PARAM = new URLSearchParams(location.search).get('api');

/**
 * The API's address from ?api=, forgiving the usual slips: without http:// the browser would treat
 * "localhost:3002" as a path on this page's own server, and a trailing /api/v1 would be doubled.
 * null if the value still isn't a web address.
 */
function apiRootFrom(param) {
  if (param === null || param.trim() === '') return LIVE_API;
  const value = param.trim();
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

const API_ROOT = apiRootFrom(API_PARAM);
const BASE = API_ROOT === null ? null : `${API_ROOT}/api/v1`;
const PAGE_SIZE = 12;
const LAST_ORDER_KEY = 'food-market:last-order';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------------------------
// Talking to the API

/**
 * Calls the API and returns { ok, status, data, meta } or { ok: false, status, code, message }.
 * Never throws: network failures come back as an error result too.
 */
async function callApi(path, { method = 'GET', body, token } = {}) {
  if (BASE === null) {
    return {
      ok: false,
      status: 0,
      code: 'BAD_API_ADDRESS',
      message: `"?api=${API_PARAM}" isn't a web address. Use something like ?api=http://localhost:3002`,
    };
  }
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK',
      message: `Can't reach ${API_ROOT}. Are you online?`,
    };
  }

  const json = await res.json().catch(() => null);
  if (res.ok && json && 'data' in json) return { ok: true, status: res.status, ...json };

  if (res.status === 429) startCooldown(Number(res.headers.get('Retry-After')) || 60);
  return {
    ok: false,
    status: res.status,
    code: json?.error?.code ?? 'UNKNOWN',
    message: json?.error?.message ?? `Unexpected answer (HTTP ${res.status})`,
  };
}

function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== undefined) q.set(k, String(v));
  return `?${q}`;
}

// ---------------------------------------------------------------------------------------------
// Small helpers. API data is always inserted as text, never as HTML.

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
/** The API speaks whole kobo; this is the only place it becomes naira. */
const formatKobo = (kobo) => naira.format(kobo / 100);

function showNotice(result) {
  // A 429 is shown by the cooldown countdown instead.
  if (result.status === 429) return;
  const notice = $('notice');
  notice.className = result.status === 429 ? 'notice warning' : 'notice';
  notice.textContent = `${result.code}: ${result.message}`;
  notice.hidden = false;
}

function clearNotice() {
  $('notice').hidden = true;
}

function pageRange(meta) {
  if (meta.total === 0) return 'Nothing found';
  return `${meta.offset + 1}–${meta.offset + meta.limit < meta.total ? meta.offset + meta.limit : meta.total} of ${meta.total}`;
}

// 429: disable every button until Retry-After has passed, counting down in the notice.
let cooldownTimer;
function startCooldown(seconds) {
  clearInterval(cooldownTimer);
  let left = seconds;
  const buttons = document.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  const tick = () => {
    const notice = $('notice');
    notice.className = 'notice warning';
    notice.hidden = false;
    notice.textContent = `RATE_LIMITED: too many requests from this network. Try again in ${left}s.`;
    if (left-- <= 0) {
      clearInterval(cooldownTimer);
      buttons.forEach((b) => (b.disabled = false));
      clearNotice();
      renderRestaurantPager();
      renderMenuPager();
    }
  };
  tick();
  cooldownTimer = setInterval(tick, 1000);
}

// ---------------------------------------------------------------------------------------------
// 1. Restaurants

const restaurants = { offset: 0, meta: null, selected: null };

async function loadRestaurants() {
  const f = new FormData($('restaurant-filters'));
  const result = await callApi(
    `/restaurants${query({
      area: f.get('area').trim(),
      cuisine: f.get('cuisine').trim(),
      sort: f.get('sort'),
      order: f.get('order'),
      limit: PAGE_SIZE,
      offset: restaurants.offset,
    })}`,
  );
  if (!result.ok) return showNotice(result);
  clearNotice();

  restaurants.meta = result.meta;
  $('restaurants').replaceChildren(
    ...result.data.map((r) =>
      el(
        'li',
        { className: `card${restaurants.selected?.id === r.id ? ' selected' : ''}` },
        el('h3', { textContent: r.name }),
        el('span', { className: 'muted', textContent: `${r.area} · ${r.cuisine}` }),
        el('span', {
          textContent: `${r.rating === null ? 'No rating yet' : `★ ${r.rating.toFixed(1)}`} · ${
            r.deliveryFee === 0 ? 'Free delivery' : `Delivery ${formatKobo(r.deliveryFee)}`
          }`,
        }),
        el('button', {
          type: 'button',
          textContent: 'See menu',
          onclick: () => selectRestaurant(r),
        }),
      ),
    ),
  );
  renderRestaurantPager();
}

function renderRestaurantPager() {
  const meta = restaurants.meta;
  if (!meta) return;
  $('restaurants-range').textContent = pageRange(meta);
  $('restaurants-prev').disabled = meta.offset === 0;
  $('restaurants-next').disabled = !meta.hasMore;
}

// ---------------------------------------------------------------------------------------------
// 2. Menu

const menu = { offset: 0, meta: null };
let cart = new Map(); // menuItemId → { item, quantity }

function selectRestaurant(restaurant) {
  restaurants.selected = restaurant;
  menu.offset = 0;
  cart = new Map();
  $('menu-restaurant').textContent = `${restaurant.name}, ${restaurant.area}`;
  $('menu-section').hidden = false;
  renderCart();
  void loadRestaurants();
  void loadMenu();
  $('menu-section').scrollIntoView({ behavior: 'smooth' });
}

async function loadMenu() {
  const f = new FormData($('menu-filters'));
  const result = await callApi(
    `/restaurants/${restaurants.selected.id}/menu${query({
      category: f.get('category').trim(),
      sort: f.get('sort'),
      order: f.get('order'),
      limit: PAGE_SIZE,
      offset: menu.offset,
    })}`,
  );
  if (!result.ok) return showNotice(result);
  clearNotice();

  menu.meta = result.meta;
  $('menu').replaceChildren(
    ...result.data.map((item) =>
      el(
        'li',
        { className: 'card' },
        el('h3', { textContent: item.name }),
        el('span', { className: 'muted', textContent: item.category }),
        el('span', { textContent: formatKobo(item.price) }),
        el('button', { type: 'button', textContent: 'Add', onclick: () => addToCart(item) }),
      ),
    ),
  );
  renderMenuPager();
}

function renderMenuPager() {
  const meta = menu.meta;
  if (!meta) return;
  $('menu-range').textContent = pageRange(meta);
  $('menu-prev').disabled = meta.offset === 0;
  $('menu-next').disabled = !meta.hasMore;
}

// ---------------------------------------------------------------------------------------------
// 3. Order

function addToCart(item) {
  const line = cart.get(item.id) ?? { item, quantity: 0 };
  line.quantity += 1;
  cart.set(item.id, line);
  renderCart();
}

function changeQuantity(id, delta) {
  const line = cart.get(id);
  line.quantity += delta;
  if (line.quantity <= 0) cart.delete(id);
  renderCart();
}

function renderCart() {
  $('order-section').hidden = cart.size === 0;
  // A new cart means a new order: bring the form back if the last one was just placed.
  $('order-form').hidden = false;
  $('cart-estimate-line').hidden = false;
  const lines = [...cart.values()];
  $('cart').replaceChildren(
    ...lines.map(({ item, quantity }) =>
      el(
        'li',
        { className: 'line' },
        el('span', { textContent: `${quantity} × ${item.name}` }),
        el(
          'span',
          {},
          `${formatKobo(item.price * quantity)} `,
          el('button', {
            type: 'button',
            className: 'secondary',
            textContent: '−',
            ariaLabel: `One less ${item.name}`,
            onclick: () => changeQuantity(item.id, -1),
          }),
          ' ',
          el('button', {
            type: 'button',
            className: 'secondary',
            textContent: '+',
            ariaLabel: `One more ${item.name}`,
            onclick: () => changeQuantity(item.id, 1),
          }),
        ),
      ),
    ),
  );
  // Only an estimate for the screen: the API ignores client prices and computes the real total.
  const items = lines.reduce((sum, { item, quantity }) => sum + item.price * quantity, 0);
  $('cart-estimate').textContent = formatKobo(items + (restaurants.selected?.deliveryFee ?? 0));
}

async function placeOrder(event) {
  event.preventDefault();
  const f = new FormData(event.target);
  const result = await callApi('/orders', {
    method: 'POST',
    body: {
      restaurantId: restaurants.selected.id,
      customer: { name: f.get('name'), phone: f.get('phone'), area: f.get('area') },
      items: [...cart.values()].map(({ item, quantity }) => ({ menuItemId: item.id, quantity })),
    },
  });
  if (!result.ok) return showNotice(result);
  clearNotice();

  const order = result.data;
  try {
    localStorage.setItem(
      LAST_ORDER_KEY,
      JSON.stringify({ id: order.id, token: order.trackingToken }),
    );
  } catch {
    // Storage can be unavailable (private browsing); the token is still shown below to copy.
  }
  $('track-form').orderId.value = order.id;
  $('track-form').token.value = order.trackingToken;

  // The order is done: hide the form so a second tap can't place a duplicate. Adding an item to
  // the menu starts a fresh order and brings it back.
  cart = new Map();
  renderCart();
  $('order-section').hidden = false;
  $('order-form').hidden = true;
  $('cart-estimate-line').hidden = true;
  $('cart').replaceChildren(
    el(
      'li',
      { className: 'result' },
      el('h3', { textContent: `Order placed: ${formatKobo(order.total)}` }),
      el('p', { className: 'caption', textContent: `Order id ${order.id}` }),
      el('p', { textContent: 'Your tracking token (keep it; it is shown only once):' }),
      el('code', { textContent: order.trackingToken }),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// 4. Tracking

async function trackOrder(event) {
  event.preventDefault();
  const f = new FormData(event.target);
  const result = await callApi(`/orders/${encodeURIComponent(f.get('orderId').trim())}`, {
    token: f.get('token').trim(),
  });
  if (!result.ok) return showNotice(result);
  clearNotice();

  const order = result.data;
  $('tracked').replaceChildren(
    el(
      'div',
      { className: 'panel' },
      el('span', {
        className: `status ${order.status}`,
        textContent: order.status.replaceAll('_', ' '),
      }),
      el('p', {
        textContent: `Total ${formatKobo(order.total)} · placed ${new Date(order.createdAt).toLocaleString()}`,
      }),
      el(
        'ul',
        { className: 'lines' },
        ...order.items.map((i) =>
          el('li', {
            className: 'line',
            textContent: `${i.quantity} × ${i.name} — ${formatKobo(i.unitPrice * i.quantity)}`,
          }),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Start-up

document.addEventListener('DOMContentLoaded', () => {
  $('restaurant-filters').addEventListener('submit', (e) => {
    e.preventDefault();
    restaurants.offset = 0;
    void loadRestaurants();
  });
  $('restaurants-prev').addEventListener('click', () => {
    restaurants.offset = Math.max(0, restaurants.offset - PAGE_SIZE);
    void loadRestaurants();
  });
  $('restaurants-next').addEventListener('click', () => {
    restaurants.offset += PAGE_SIZE;
    void loadRestaurants();
  });
  $('menu-filters').addEventListener('submit', (e) => {
    e.preventDefault();
    menu.offset = 0;
    void loadMenu();
  });
  $('menu-prev').addEventListener('click', () => {
    menu.offset = Math.max(0, menu.offset - PAGE_SIZE);
    void loadMenu();
  });
  $('menu-next').addEventListener('click', () => {
    menu.offset += PAGE_SIZE;
    void loadMenu();
  });
  $('order-form').addEventListener('submit', placeOrder);
  $('track-form').addEventListener('submit', trackOrder);

  try {
    const last = JSON.parse(localStorage.getItem(LAST_ORDER_KEY) ?? 'null');
    if (last) {
      $('track-form').orderId.value = last.id;
      $('track-form').token.value = last.token;
    }
  } catch {
    // No saved order, or storage unavailable: the tracking form simply starts empty.
  }

  void loadRestaurants();
});
