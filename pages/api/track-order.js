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
      console.error('Missing Shopify config');
      return res.status(500).json({ error: 'Server config error' });
    }

    const cleanOrderNumber = orderNumber.replace('#', '').trim();
    let foundOrder = null;
    let pageInfo = null;
    let page = 1;

    do {
      const url = new URL(`https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json`);
      url.searchParams.set('limit', '250');
      url.searchParams.set('status', 'any');
      if (pageInfo) url.searchParams.set('page_info', pageInfo);

      const response = await fetch(url.href, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      const linkHeader = response.headers.get('link');
      if (!response.ok) {
        console.error('Failed to fetch orders:', await response.text());
        return res.status(500).json({ error: 'Failed to fetch orders' });
      }

      const data = await response.json();
      const orders = data.orders || [];

      foundOrder = orders.find(o =>
        (o.order_number?.toString() === cleanOrderNumber ||
         o.name === `#${cleanOrderNumber}` ||
         o.name === cleanOrderNumber) &&
        o.email?.toLowerCase() === email.toLowerCase()
      );

      if (foundOrder) break;

      // Parse next page info from the Link header
      pageInfo = null;
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) {
          const nextUrl = new URL(match[1]);
          pageInfo = nextUrl.searchParams.get('page_info');
        }
      }

      page++;
    } while (pageInfo);

    if (!foundOrder) {
      return res.status(404).json({ error: 'Order not found or email does not match' });
    }

    // Check for portrait product
    const hasPortrait = foundOrder.line_items?.some(item =>
      item.title?.toLowerCase().includes('portrait') ||
      item.product_type?.toLowerCase().includes('portrait') ||
      item.variant_title?.toLowerCase().includes('portrait')
    );

    if (!hasPortrait) {
      return res.status(404).json({ error: 'Order found, but no portrait product detected' });
    }

    // Fetch order events for possible delivery message
    let portraitMessage = null;
    try {
      const eventsRes = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/orders/${foundOrder.id}/events.json`, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        const matched = eventsData.events?.find(e =>
          e.message?.toLowerCase().includes('portrait') || e.message?.includes('http')
        );
        if (matched) portraitMessage = matched.message;
      }
    } catch (e) {
      console.warn('Event check failed:', e.message);
    }

    const orderDate = new Date(foundOrder.created_at);
    const now = new Date();
    const hoursElapsed = Math.floor((now - orderDate) / (1000 * 60 * 60));

    return res.status(200).json({
      order_number: cleanOrderNumber,
      email: foundOrder.email,
      order_date: foundOrder.created_at,
      total_price: foundOrder.total_price,
      currency: foundOrder.currency === 'GBP' ? '£' : foundOrder.currency,
      hours_elapsed,
      portrait_delivered: !!portraitMessage,
      delivery_message: portraitMessage || 'Your portrait is being created.',
      delivery_date: portraitMessage ? (foundOrder.updated_at || foundOrder.created_at) : null,
      portrait_link: portraitMessage?.includes('http') ? portraitMessage.match(/https?:\/\/\S+/)?.[0] : null,
      status: portraitMessage ? 'completed' : 'in_progress'
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
