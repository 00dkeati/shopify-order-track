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
    return res.status(500).json({ error: 'Shopify credentials missing' });
  }

  const cleanOrderNumber = orderNumber.toString().replace('#', '').trim();
  let foundOrder = null;
  let pageInfo = null;
  let nextPageLink = `https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?limit=250&status=any&order=created_at+desc`;

  try {
    while (nextPageLink && !foundOrder) {
      const resp = await fetch(nextPageLink, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      const data = await resp.json();

      // Search for matching order in this page
      foundOrder = data.orders.find(order =>
        (order.order_number?.toString() === cleanOrderNumber || order.name === `#${cleanOrderNumber}` || order.name === cleanOrderNumber) &&
        order.email?.toLowerCase() === email.toLowerCase()
      );

      // If not found, check if there’s a "Link" header for next page
      const linkHeader = resp.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        nextPageLink = match ? match[1] : null;
      } else {
        nextPageLink = null;
      }
    }

    if (!foundOrder) return res.status(404).json({ error: 'Order not found or email does not match' });

    // Fetch events from timeline to see if portrait link was posted
    let portraitMessage = null;
    try {
      const eventRes = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/orders/${foundOrder.id}/events.json`, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      const eventsData = await eventRes.json();
      const matched = eventsData.events?.find(e =>
        e.message?.toLowerCase().includes('portrait') || e.message?.includes('http')
      );
      if (matched) {
        portraitMessage = matched.message;
      }
    } catch (err) {
      console.error('Error fetching events:', err.message);
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
      portrait_delivered: !!portraitMessage,
      delivery_message: portraitMessage || 'Your portrait is being created.',
      delivery_date: portraitMessage ? (foundOrder.updated_at || foundOrder.created_at) : null,
      portrait_link: portraitMessage?.includes('http') ? portraitMessage.match(/https?:\/\/\S+/)?.[0] : null,
      hours_elapsed: hoursElapsed,
      status: portraitMessage ? 'completed' : 'in_progress'
    });

  } catch (err) {
    console.error('Final error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
