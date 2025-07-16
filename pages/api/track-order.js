export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderNumber, email } = req.body;
  if (!orderNumber || !email) return res.status(400).json({ error: 'Order number and email are required' });

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Missing Shopify configuration' });
  }

  const cleanOrderNumber = orderNumber.replace('#', '').trim();
  let order = null;

  const searchPages = async () => {
    let page = 1;
    let found = false;

    while (!found) {
      const res = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?status=any&limit=250&page=${page}`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      const data = await res.json();
      if (!data.orders || data.orders.length === 0) break;

      order = data.orders.find(o =>
        (o.order_number?.toString() === cleanOrderNumber || o.name === `#${cleanOrderNumber}` || o.name === cleanOrderNumber) &&
        o.email?.toLowerCase() === email.toLowerCase()
      );

      if (order) {
        found = true;
        break;
      }

      page++;
    }
  };

  try {
    // 1st attempt: search by order name directly
    const searchUrl = `https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?name=${cleanOrderNumber}`;
    const res1 = await fetch(searchUrl, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    const data1 = await res1.json();
    order = data1.orders?.find(o => o.email?.toLowerCase() === email.toLowerCase());
  } catch (e) {
    console.log('Direct search failed:', e.message);
  }

  // If not found, paginate through orders
  if (!order) {
    try {
      await searchPages();
    } catch (e) {
      console.log('Paginated search failed:', e.message);
    }
  }

  if (!order) return res.status(404).json({ error: 'Order not found or email does not match' });

  const hasPortraitProduct = order.line_items?.some(item =>
    item.title?.toLowerCase().includes('portrait') ||
    item.product_type?.toLowerCase().includes('portrait') ||
    item.variant_title?.toLowerCase().includes('portrait')
  );

  if (!hasPortraitProduct) {
    return res.status(404).json({ error: 'Order found, but no portrait product detected' });
  }

  let portraitDeliveryNote = null;
  try {
    const timelineRes = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/orders/${order.id}/events.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    const timelineData = await timelineRes.json();
    const matchedEvent = timelineData.events?.find(e =>
      e.message?.toLowerCase().includes('portrait') ||
      e.message?.includes('http')
    );
    if (matchedEvent) {
      portraitDeliveryNote = matchedEvent.message;
    }
  } catch (e) {
    console.error('Timeline fetch failed:', e.message);
  }

  const orderDate = new Date(order.created_at);
  const now = new Date();
  const hoursElapsed = Math.floor((now - orderDate) / (1000 * 60 * 60));

  return res.status(200).json({
    order_number: cleanOrderNumber,
    email: order.email,
    order_date: order.created_at,
    total_price: order.total_price,
    currency: order.currency === 'GBP' ? '£' : order.currency,
    portrait_delivered: !!portraitDeliveryNote,
    delivery_message: portraitDeliveryNote || 'Your portrait is being created.',
    delivery_date: portraitDeliveryNote ? (order.updated_at || order.created_at) : null,
    portrait_link: portraitDeliveryNote?.includes('http') ? portraitDeliveryNote.match(/https?:\/\/\S+/)?.[0] : null,
    hours_elapsed: hoursElapsed,
    status: portraitDeliveryNote ? 'completed' : 'in_progress'
  });
}
