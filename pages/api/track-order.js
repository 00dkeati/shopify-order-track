export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderNumber, email } = req.body;
    if (!orderNumber || !email) return res.status(400).json({ error: 'Order number and email are required' });

    const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      console.error('Missing Shopify configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const cleanOrderNumber = orderNumber.replace('#', '').trim();
    let order = null;

    try {
      const res1 = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?name=%23${cleanOrderNumber}&limit=50`, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      const data1 = await res1.json();
      order = data1.orders?.find(o => o.email?.toLowerCase() === email.toLowerCase());
    } catch (e) {
      console.log('Search method 1 failed:', e.message);
    }

    if (!order) {
      try {
        const res2 = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?name=${cleanOrderNumber}&limit=50`, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        const data2 = await res2.json();
        order = data2.orders?.find(o => o.email?.toLowerCase() === email.toLowerCase());
      } catch (e) {
        console.log('Search method 2 failed:', e.message);
      }
    }

    if (!order) {
      try {
// Method 3: Search all recent orders from last 90 days
if (!order) {
  try {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 90); // 90 days back
    const isoDate = fromDate.toISOString();

    const res3 = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?status=any&created_at_min=${isoDate}`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    const data3 = await res3.json();
    order = data3.orders?.find(o =>
      (o.order_number?.toString() === cleanOrderNumber ||
       o.name === `#${cleanOrderNumber}` ||
       o.name === cleanOrderNumber) &&
      o.email?.toLowerCase() === email.toLowerCase()
    );
  } catch (e) {
    console.log('Search method 3 failed:', e.message);
  }
}          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        const data3 = await res3.json();
        order = data3.orders?.find(o =>
          (o.order_number?.toString() === cleanOrderNumber || o.name === `#${cleanOrderNumber}` || o.name === cleanOrderNumber) &&
          o.email?.toLowerCase() === email.toLowerCase()
        );
      } catch (e) {
        console.log('Search method 3 failed:', e.message);
      }
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

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
      const eventsRes = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/orders/${order.id}/events.json`, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      const eventsData = await eventsRes.json();
      const matchedEvent = eventsData.events?.find(e =>
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

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
