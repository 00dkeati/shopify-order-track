export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderNumber, email } = req.body;

  if (!orderNumber || !email) {
    return res.status(400).json({ error: 'Order number and email are required' });
  }

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Missing Shopify credentials' });
  }

  try {
    const query = `
      {
        orders(first: 1, query: "name:#${orderNumber}") {
          edges {
            node {
              name
              email
              createdAt
              updatedAt
              id
              lineItems(first: 10) {
                edges {
                  node {
                    title
                    variantTitle
                  }
                }
              }
              events(first: 10) {
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

    const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({ query })
    });

    const result = await response.json();
    const order = result.data?.orders?.edges?.[0]?.node;

    if (!order || order.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(404).json({ error: 'Order not found or email does not match' });
    }

    const portraitItem = order.lineItems.edges.find(item =>
      item.node.title.toLowerCase().includes('portrait') ||
      item.node.variantTitle?.toLowerCase().includes('portrait')
    );

    const deliveryNote = order.events.edges.find(event =>
      event.node.message?.toLowerCase().includes('portrait') ||
      event.node.message?.includes('http')
    )?.node.message;

    const hoursElapsed = Math.floor(
      (new Date() - new Date(order.createdAt)) / (1000 * 60 * 60)
    );

    return res.status(200).json({
      order_number: order.name.replace('#', ''),
      email: order.email,
      order_date: order.createdAt,
      total_price: 'N/A', // Not available in GraphQL unless extra permissions added
      currency: 'GBP',
      hours_elapsed: hoursElapsed,
      portrait_delivered: !!deliveryNote,
      delivery_message: deliveryNote || 'Your portrait is being created.',
      portrait_link: deliveryNote?.includes('http') ? deliveryNote.match(/https?:\/\/\S+/)?.[0] : null,
      delivery_date: order.updatedAt,
      status: deliveryNote ? 'completed' : 'in_progress'
    });
  } catch (err) {
    console.error('GraphQL API Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
