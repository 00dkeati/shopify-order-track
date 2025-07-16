// Vercel API Route: /api/track-order.js
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderNumber, email } = req.body;

    if (!orderNumber || !email) {
      return res.status(400).json({ error: 'Order number and email are required' });
    }

    // Get Shopify credentials from environment variables
    const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
      console.error('Missing Shopify configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Search for the order in Shopify
    const orderData = await findShopifyOrder(orderNumber, email, SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN);

    if (!orderData) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.status(200).json(orderData);

  } catch (error) {
    console.error('Error tracking order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function findShopifyOrder(orderNumber, email, storeUrl, accessToken) {
  try {
    const cleanOrderNumber = orderNumber.replace('#', '');
    const apiUrl = `https://${storeUrl}/admin/api/2023-10/orders.json?name=%23${cleanOrderNumber}&limit=1`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    } );

    if (!response.ok) {
      console.error('Shopify API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (!data.orders || data.orders.length === 0) {
      return null;
    }

    const order = data.orders[0];

    // Verify email matches
    if (order.email?.toLowerCase() !== email.toLowerCase()) {
      return null;
    }

    // Check if it's a portrait order
    const hasPortraitProduct = order.line_items.some(item => 
      item.title.toLowerCase().includes('portrait') ||
      item.product_type?.toLowerCase().includes('portrait')
    );

    if (!hasPortraitProduct) {
      return null;
    }

    // Calculate hours elapsed
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const hoursElapsed = Math.floor((now - orderDate) / (1000 * 60 * 60));

    // Determine portrait status
    const isFulfilled = order.fulfillment_status === 'fulfilled';
    
    return {
      order_number: cleanOrderNumber,
      email: order.email,
      order_date: order.created_at,
      total_price: order.total_price,
      currency: order.currency === 'GBP' ? '£' : order.currency,
      portrait_delivered: isFulfilled,
      delivery_message: isFulfilled ? 'Your portrait has been delivered!' : 'Your portrait is being created.',
      delivery_date: isFulfilled ? order.updated_at : null,
      portrait_link: null,
      hours_elapsed: hoursElapsed
    };

  } catch (error) {
    console.error('Error fetching from Shopify:', error);
    return null;
  }
}
