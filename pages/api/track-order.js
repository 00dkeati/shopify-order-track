import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderNumber, email } = req.body;

  if (!orderNumber || !email) {
    return res.status(400).json({ error: 'Missing orderNumber or email' });
  }

  const formattedOrderNumber = `#${orderNumber}`;

  const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  const query = `
    query getOrderByNumber($orderName: String!) {
      orders(first: 1, query: $orderName) {
        edges {
          node {
            name
            email
            createdAt
            id
            lineItems(first: 10) {
              edges {
                node {
                  title
                  variantTitle
                }
              }
            }
            events(first: 5) {
              edges {
                node {
                  message
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    orderName: `name:${formattedOrderNumber}`,
  };

  try {
    const response = await fetch(`https://${shopifyStore}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();

    const orderEdges = result?.data?.orders?.edges;

    if (!orderEdges || orderEdges.length === 0) {
      return res.status(404).json({ error: 'Order not found or email does not match' });
    }

    const order = orderEdges[0].node;

    if (order.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: 'Order not found or email does not match' });
    }

    const orderCreated = new Date(order.createdAt);
    const hoursElapsed = Math.floor((Date.now() - orderCreated.getTime()) / (1000 * 60 * 60));

    return res.status(200).json({
      order_number: order.name.replace('#', ''),
      email: order.email,
      order_date: order.createdAt,
      total_price: 'Unknown', // Update if you want to include
      currency: 'GBP', // Optional
      hours_elapsed: hoursElapsed,
      portrait_delivered: false,
      delivery_message: '',
      portrait_link: '',
      delivery_date: '',
      status: 'in_progress',
    });
  } catch (err) {
    console.error('Shopify API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
