export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orderNumber, email } = req.body;

  if (!orderNumber || !email) {
    return res.status(400).json({ error: 'Missing order number or email' });
  }

  const SHOP = process.env.SHOPIFY_SHOP;
  const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  const query = `
    {
      orders(first: 1, query: "name:#${orderNumber}") {
        edges {
          node {
            id
            name
            email
            createdAt
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            tags
            noteAttributes {
              name
              value
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(`https://${SHOP}/admin/api/2023-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': ACCESS_TOKEN,
      },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();
    const order = result?.data?.orders?.edges?.[0]?.node;

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.email.toLowerCase().trim() !== email.toLowerCase().trim()) {
      return res.status(403).json({ error: 'Order found, but email does not match' });
    }

    const timeNow = new Date();
    const createdAt = new Date(order.createdAt);
    const hoursElapsed = Math.floor((timeNow - createdAt) / 1000 / 60 / 60);

    const portraitDelivered = order.tags.includes("portrait_delivered");
    const portraitLink = order.noteAttributes.find(attr => attr.name === "portrait_link")?.value || "";
    const deliveryDate = order.noteAttributes.find(attr => attr.name === "delivery_date")?.value || "";
    const deliveryMessage = order.noteAttributes.find(attr => attr.name === "delivery_message")?.value || "";

    return res.status(200).json({
      order_number: order.name,
      email: order.email,
      order_date: order.createdAt,
      total_price: order.totalPriceSet.shopMoney.amount,
      currency: order.totalPriceSet.shopMoney.currencyCode,
      hours_elapsed: hoursElapsed,
      portrait_delivered: portraitDelivered,
      portrait_link: portraitLink,
      delivery_date: deliveryDate,
      delivery_message: deliveryMessage,
      status: portraitDelivered ? "complete" : "in_progress",
    });

  } catch (error) {
    console.error("GraphQL error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
