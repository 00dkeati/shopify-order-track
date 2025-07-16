// pages/api/track-order.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderNumber, email } = req.body;

  if (!orderNumber || !email) {
    return res.status(400).json({ error: 'Missing order number or email' });
  }

  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  const endpoint = `https://${shop}/admin/api/2023-07/graphql.json`;

  let cursor = null;
  let foundOrder = null;

  try {
    while (true) {
      const query = `
        query {
          orders(first: 100, after: ${cursor ? `"${cursor}"` : null}, reverse: true, query: "email:${email}") {
            edges {
              cursor
              node {
                name
                email
                createdAt
                id
                tags
                noteAttributes {
                  name
                  value
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const response = await fetch(endpoint, {
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
        if (
          order.name.replace('#', '').trim() === orderNumber.toString().trim() &&
          order.email.toLowerCase().trim() === email.toLowerCase().trim()
        ) {
          foundOrder = order;
          break;
        }
      }

      if (foundOrder) break;
      if (!json.data.orders.pageInfo.hasNextPage) break;

      cursor = orders[orders.length - 1].cursor;
    }

    if (!foundOrder) {
      return res.status(404).json({ error: 'Order not found or email does not match' });
    }

    const timeNow = new Date();
    const createdAt = new Date(foundOrder.createdAt);
    const hoursElapsed = Math.floor((timeNow - createdAt) / 1000 / 60 / 60);

    const portraitDelivered = foundOrder.tags.includes('portrait_delivered');
    const portraitLink = foundOrder.noteAttributes.find(attr => attr.name === 'portrait_link')?.value || '';
    const deliveryDate = foundOrder.noteAttributes.find(attr => attr.name === 'delivery_date')?.value || '';
    const deliveryMessage = foundOrder.noteAttributes.find(attr => attr.name === 'delivery_message')?.value || '';

    return res.status(200).json({
      order_number: orderNumber,
      email: foundOrder.email,
      order_date: foundOrder.createdAt,
      total_price: 'Unknown',
      currency: 'GBP',
      hours_elapsed: hoursElapsed,
      portrait_delivered: portraitDelivered,
      portrait_link: portraitLink,
      delivery_date: deliveryDate,
      delivery_message: deliveryMessage,
      status: portraitDelivered ? 'complete' : 'in_progress',
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}   });

  } catch (error) {
    console.error("GraphQL error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
