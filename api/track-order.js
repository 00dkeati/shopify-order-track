// WORKING API SOLUTION - Replace your /api/track-order.js with this exact code

export default async function handler(req, res) {
  // Handle CORS
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

    // Get environment variables
    const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      console.error('Missing Shopify configuration');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Clean order number
    const cleanOrderNumber = orderNumber.replace('#', '');
    
    // Shopify API call
    const shopifyUrl = `https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?name=%23${cleanOrderNumber}&limit=1`;
    
    const shopifyResponse = await fetch(shopifyUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!shopifyResponse.ok) {
      console.error('Shopify API error:', shopifyResponse.status);
      return res.status(404).json({ error: 'Order not found' });
    }

    const shopifyData = await shopifyResponse.json();
    
    if (!shopifyData.orders || shopifyData.orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = shopifyData.orders[0];

    // Verify email matches
    if (order.email?.toLowerCase() !== email.toLowerCase()) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if it's a portrait order
    const hasPortraitProduct = order.line_items.some(item => 
      item.title.toLowerCase().includes('portrait') ||
      item.product_type?.toLowerCase().includes('portrait')
    );

    if (!hasPortraitProduct) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Calculate hours elapsed
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const hoursElapsed = Math.floor((now - orderDate) / (1000 * 60 * 60));

    // Determine status
    const isFulfilled = order.fulfillment_status === 'fulfilled';
    
    // Return success response
    return res.status(200).json({
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
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

