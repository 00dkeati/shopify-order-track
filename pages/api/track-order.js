export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Missing email address' });
  }

  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  let hasNextPage = true;
  let endCursor = null;
  let foundOrder = null;

  try {
    while (hasNextPage && !foundOrder) {
      const query = `
        query {
          orders(first: 50, after: ${endCursor ? `"${endCursor}"` : null}, sortKey: CREATED_AT, reverse: true) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                name
                email
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
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

      const response = await fetch(`https://${shop}/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query }),
      });

      const json = await response.json();

      const orders = json.data.orders.edges;
      for (const edge of orders) {
        const order = edge.node;
        if (order.email.toLowerCase().trim() === email.toLowerCase().trim()) {
          foundOrder = order;
          break;
        }
      }

      hasNextPage = json.data.orders.pageInfo.hasNextPage;
      endCursor = json.data.orders.pageInfo.endCursor;
    }

    if (!foundOrder) {
      return res.status(404).json({ error: 'No orders found for that email' });
    }

    const createdAt = new Date(foundOrder.createdAt);
    const now = new Date();
    const hoursElapsed = Math.floor((now - createdAt) / (1000 * 60 * 60));

    const events = foundOrder.events.edges.map(e => e.node);
    const deliveryEvent = events.find(e =>
      e.message?.toLowerCase().includes('portrait') || e.message?.includes('http')
    );

    const portraitLink = deliveryEvent?.message?.match(/https?:\/\/\S+/)?.[0] || '';
    const deliveryMessage = deliveryEvent?.message || '';
    const deliveryDate = deliveryEvent?.createdAt || '';

    return res.status(200).json({
      order_number: foundOrder.name,
      email: foundOrder.email,
      order_date: foundOrder.createdAt,
      total_price: foundOrder.totalPriceSet.shopMoney.amount,
      currency: foundOrder.totalPriceSet.shopMoney.currencyCode,
      hours_elapsed: hoursElapsed,
      portrait_delivered: !!portraitLink,
      portrait_link: portraitLink,
      delivery_message: deliveryMessage,
      delivery_date: deliveryDate,
      status: portraitLink ? 'complete' : 'in_progress',
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
