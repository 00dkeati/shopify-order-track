import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { orderNumber, email } = req.body;

  const shop = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shop || !token) {
    return res.status(500).json({ error: 'Missing env variables' });
  }

  const graphqlEndpoint = `https://${shop}/admin/api/2024-01/graphql.json`;

  let hasNextPage = true;
  let cursor = null;
  let foundOrder = null;

  while (hasNextPage && !foundOrder) {
    const query = `
      {
        orders(first: 100${cursor ? `, after: "${cursor}"` : ''}) {
          pageInfo {
            hasNextPage
          }
          edges {
            cursor
            node {
              name
              email
              createdAt
              id
              lineItems(first: 5) {
                edges {
                  node {
                    title
                    product {
                      title
                    }
                  }
                }
              }
              events(first: 10) {
                edges {
                  node {
                    message
                    createdAt
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    const orders = data?.data?.orders?.edges;

    for (const edge of orders) {
      const order = edge.node;
      const orderNumStr = order.name.replace('#', '');
      if (
        orderNumStr === String(orderNumber) &&
        order.email.toLowerCase() === email.toLowerCase()
      ) {
        foundOrder = order;
        break;
      }
    }

    hasNextPage = data.data.orders.pageInfo.hasNextPage;
    cursor = orders[orders.length - 1]?.cursor;
  }

  if (!foundOrder) {
    return res.status(404).json({ error: 'Order not found or email does not match' });
  }

  // Extract portrait delivery info if exists
  let portraitLink = '';
  let deliveryDate = '';
  let message = '';
  let delivered = false;

  for (const eventEdge of foundOrder.events.edges) {
    const msg = eventEdge.node.message;
    if (msg.includes('https://') && msg.includes('portrait')) {
      portraitLink = msg.match(/https?:\/\/[^\s"]+/)?.[0];
      deliveryDate = eventEdge.node.createdAt;
      delivered = true;
      message = msg;
      break;
    }
  }

  const createdDate = new Date(foundOrder.createdAt);
  const now = new Date();
  const hoursElapsed = Math.floor((now - createdDate) / (1000 * 60 * 60));

  res.status(200).json({
    order_number: orderNumber,
    email: foundOrder.email,
    order_date: foundOrder.createdAt,
    total_price: foundOrder.totalPrice || 'N/A',
    currency: 'GBP',
    hours_elapsed: hoursElapsed,
    portrait_delivered: delivered,
    delivery_message: message,
    portrait_link: portraitLink,
    delivery_date: deliveryDate,
    status: delivered ? 'delivered' : 'in_progress'
  });
}
