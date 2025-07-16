export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Missing email address" });
  }

  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  try {
    // 1. Fetch recent orders matching email (use GraphQL to bypass pagination limits)
    const query = `
      {
        orders(first: 10, query: "email:${email}", sortKey: CREATED_AT, reverse: true) {
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
              events(first: 50) {
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

    const graphqlRes = await fetch(`https://${shop}/admin/api/2024-04/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const { data, errors } = await graphqlRes.json();
    if (errors) {
      console.error("GraphQL Errors:", errors);
      return res.status(500).json({ error: "Error fetching orders" });
    }

    const orders = data.orders.edges;
    if (!orders.length) {
      return res.status(404).json({ error: "No orders found for that email" });
    }

    const order = orders[0].node; // Use most recent
    const events = order.events.edges.map(e => e.node);
    const deliveryEvent = events.find(e =>
      e.message?.toLowerCase().includes("portrait") || e.message?.includes("http")
    );

    const portraitLink = deliveryEvent?.message?.match(/https?:\/\/\S+/)?.[0] || "";
    const deliveryMessage = deliveryEvent?.message || "";
    const deliveryDate = deliveryEvent?.createdAt || "";

    const createdAt = new Date(order.createdAt);
    const now = new Date();
    const hoursElapsed = Math.floor((now - createdAt) / (1000 * 60 * 60));

    return res.status(200).json({
      order_number: order.name,
      email: order.email,
      order_date: order.createdAt,
      total_price: order.totalPriceSet.shopMoney.amount,
      currency: order.totalPriceSet.shopMoney.currencyCode,
      hours_elapsed: hoursElapsed,
      portrait_delivered: !!portraitLink,
      portrait_link: portraitLink,
      delivery_message: deliveryMessage,
      delivery_date: deliveryDate,
      status: portraitLink ? "complete" : "in_progress"
    });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
