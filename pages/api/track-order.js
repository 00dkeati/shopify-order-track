import Shopify from 'shopify-api-node';

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_STORE_NAME,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  apiVersion: '2023-10'
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderNumber, email } = req.body;

  if (!orderNumber || !email) {
    return res.status(400).json({ error: 'Order number and email are required' });
  }

  try {
    let allOrders = [];
    let pageInfo = null;

    // Keep paginating through all orders that match the email
    do {
      const params = {
        email,
        limit: 250,
        ...(pageInfo ? { page_info: pageInfo } : {})
      };

      const response = await shopify.order.list(params);
      allOrders = allOrders.concat(response);

      // Check if there's a next page
      pageInfo = shopify.order.pagination.nextPageParameters(response);
    } while (pageInfo);

    // Search for matching order number
    const order = allOrders.find(
      (o) => o.order_number.toString() === orderNumber.toString()
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found or email does not match' });
    }

    return res.status(200).json({
      order_number: order.order_number,
      email: order.email,
      order_date: order.created_at,
      total_price: order.total_price,
      currency: order.currency,
      hours_elapsed: Math.floor((Date.now() - new Date(order.created_at)) / 3600000),
      portrait_delivered: order.tags.includes('portrait_sent'),
      delivery_message: order.note || '',
      portrait_link: order.note_attributes.find(n => n.name === 'portrait_link')?.value || '',
      delivery_date: order.note_attributes.find(n => n.name === 'delivery_date')?.value || '',
      status: order.tags.includes('portrait_sent') ? 'delivered' : 'in_progress'
    });
  } catch (error) {
    console.error('Shopify error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
