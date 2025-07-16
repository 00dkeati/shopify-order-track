// IMPROVED API - Finds all orders and shows completed portraits
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

    // Clean order number - remove # if present
    const cleanOrderNumber = orderNumber.replace('#', '');
    
    // Try multiple search methods to find the order
    let order = null;
    
    // Method 1: Search by order name with #
    try {
      const searchUrl1 = `https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?name=%23${cleanOrderNumber}&limit=50`;
      const response1 = await fetch(searchUrl1, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });
      
      if (response1.ok) {
        const data1 = await response1.json();
        if (data1.orders && data1.orders.length > 0) {
          order = data1.orders.find(o => o.email?.toLowerCase() === email.toLowerCase());
        }
      }
    } catch (e) {
      console.log('Search method 1 failed:', e.message);
    }

    // Method 2: Search by order number without #
    if (!order) {
      try {
        const searchUrl2 = `https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?name=${cleanOrderNumber}&limit=50`;
        const response2 = await fetch(searchUrl2, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        
        if (response2.ok) {
          const data2 = await response2.json();
          if (data2.orders && data2.orders.length > 0) {
            order = data2.orders.find(o => o.email?.toLowerCase() === email.toLowerCase());
          }
        }
      } catch (e) {
        console.log('Search method 2 failed:', e.message);
      }
    }

    // Method 3: Search all recent orders and filter
    if (!order) {
      try {
        const searchUrl3 = `https://${SHOPIFY_STORE}/admin/api/2023-10/orders.json?limit=250&status=any`;
        const response3 = await fetch(searchUrl3, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        });
        
        if (response3.ok) {
          const data3 = await response3.json();
          if (data3.orders && data3.orders.length > 0) {
            order = data3.orders.find(o => 
              (o.order_number?.toString() === cleanOrderNumber || 
               o.name === `#${cleanOrderNumber}` ||
               o.name === cleanOrderNumber) &&
              o.email?.toLowerCase() === email.toLowerCase()
            );
          }
        }
      } catch (e) {
        console.log('Search method 3 failed:', e.message);
      }
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if it's a portrait order
    const hasPortraitProduct = order.line_items.some(item => 
      item.title.toLowerCase().includes('portrait') ||
      item.product_type?.toLowerCase().includes('portrait') ||
      item.variant_title?.toLowerCase().includes('portrait')
    );

    if (!hasPortraitProduct) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Calculate hours elapsed
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const hoursElapsed = Math.floor((now - orderDate) / (1000 * 60 * 60));

    // Determine if order is fulfilled/completed
    const isFulfilled = order.fulfillment_status === 'fulfilled' || 
                       order.financial_status === 'paid';

    // Generate portrait image URL for completed orders
    let portraitLink = null;
    if (isFulfilled) {
      // Use the pattern from your example: order number + .png
      portraitLink = `https://cdn.shopify.com/s/files/1/d/23e8/0930/0659/4383/event_attachments/${cleanOrderNumber}.png`;
    }

    // Return success response
    return res.status(200).json({
      order_number: cleanOrderNumber,
      email: order.email,
      order_date: order.created_at,
      total_price: order.total_price,
      currency: order.currency === 'GBP' ? '£' : order.currency,
      portrait_delivered: isFulfilled,
      delivery_message: isFulfilled ? 'Your portrait has been completed!' : 'Your portrait is being created.',
      delivery_date: isFulfilled ? (order.updated_at || order.created_at) : null,
      portrait_link: portraitLink,
      hours_elapsed: hoursElapsed,
      status: isFulfilled ? 'completed' : 'in_progress'
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}



