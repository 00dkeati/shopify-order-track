// pages/api/track-order.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { orderNumber, email } = req.body;

  if (!orderNumber || !email) {
    return res.status(400).json({ error: "Missing order number or email" });
  }

  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  const limit = 250;
  let foundOrder = null;

  try {
    let url = `https://${shop}/admin/api/2023-07/orders.json?limit=${limit}&status=any`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (!data.orders || data.orders.length === 0) break;

      for (const order of data.orders) {
        if (
          order.order_number.toString() === orderNumber.toString() &&
          order.email.toLowerCase().trim() === email.toLowerCase().trim()
        ) {
          foundOrder = order;
          break;
        }
      }

      if (foundOrder) break;

      // Check for next page
      const linkHeader = response.headers.get("link");
      const nextLinkMatch = linkHeader && linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextLinkMatch ? nextLinkMatch[1] : null;
    }

    if (!foundOrder) {
      return res.status(404).json({ error: "Order not found or email does not match" });
    }

    const timeNow = new Date();
    const createdAt = new Date(foundOrder.created_at);
    const hoursElapsed = Math.floor((timeNow - createdAt) / 1000 / 60 / 60);

    const portraitDelivered = foundOrder.tags.includes("portrait_delivered");
    const portraitLink = foundOrder.note_attributes.find(attr => attr.name === "portrait_link")?.value || "";
    const deliveryDate = foundOrder.note_attributes.find(attr => attr.name === "delivery_date")?.value || "";
    const deliveryMessage = foundOrder.note_attributes.find(attr => attr.name === "delivery_message")?.value || "";

    return res.status(200).json({
      order_number: foundOrder.order_number,
      email: foundOrder.email,
      order_date: foundOrder.created_at,
      total_price: foundOrder.total_price,
      currency: foundOrder.currency,
      hours_elapsed: hoursElapsed,
      portrait_delivered: portraitDelivered,
      portrait_link: portraitLink,
      delivery_date: deliveryDate,
      delivery_message: deliveryMessage,
      status: portraitDelivered ? "complete" : "in_progress",
    });
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
