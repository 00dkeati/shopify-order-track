// Shopify GraphQL Order Lookup API
// This replaces the REST API logic with full pagination support via GraphQL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { orderNumber, email } = req.body;
    if (!orderNumber || !email) return res.status(400).json({ error: 'Order number and email are required' });

    const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      console.error('Missing Shopify config');
      return res.status(500).json({ error: 'Server config error' });
    }

    const cleanOrderNumber = orderNumber.replace('#', '').trim();

    let matchedOrder = null;
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage && !matchedOrder) {
      const query = `
        query getOrders($cursor: String) {
          orders(first: 100, after: $cursor, reverse: true, query: "created_at:>=2024-01-01") {
            pageInfo {
              hasNextPage
            }
            edges {
              cursor
              node {
                id
                name
                email
                createdAt
                updatedAt
                orderNumber
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      title
                      product {
                        productType
                      }
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

      const graphqlResponse = await fetch(`https://${SHOPIFY_STORE}/admin/api/2023-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          query,
          variables: { cursor },
        })
      });

      const result = await graphqlResponse.json();
      const orders = result.data.orders.edges;

      for (const edge of orders) {
        const o = edge.node;
        if (
          o.orderNumber.toString() === cleanOrderNumber &&
          o.email?.toLowerCase() === email.toLowerCase()
        ) {
          matchedOrder = o;
          break;
        }
      }

      hasNextPage = result.data.orders.pageInfo.hasNextPage;
      if (orders.length > 0) cursor = orders[orders.length - 1].cursor;
    }

    if (!matchedOrder) return res.status(404).json({ error: 'Order not found or email does not match' });

    const lineItems = matchedOrder.lineItems.edges.map(e => e.node);
    const hasPortrait = lineItems.some(item =>
      item.title?.toLowerCase().includes('portrait') ||
      item.product?.productType?.toLowerCase().includes('portrait') ||
      item.variantTitle?.toLowerCase().includes('portrait')
    );

    if (!hasPortrait) return res.status(404).json({ error: 'Order found, but no portrait product detected' });

    const events = matchedOrder.events.edges.map(e => e.node.message).filter(Boolean);
    const portraitDeliveryNote = events.find(msg => msg.includes('http') || msg.toLowerCase().includes('portrait'));

    const orderDate = new Date(matchedOrder.createdAt);
    const now = new Date();
    const hoursElapsed = Math.floor((now - orderDate) / (1000 * 60 * 60));

    return res.status(200).json({
      order_number: cleanOrderNumber,
      email: matchedOrder.email,
      order_date: matchedOrder.createdAt,
      total_price: matchedOrder.totalPriceSet.shopMoney.amount,
      currency: matchedOrder.totalPriceSet.shopMoney.currencyCode === 'GBP' ? '£' : matchedOrder.totalPriceSet.shopMoney.currencyCode,
      portrait_delivered: !!portraitDeliveryNote,
      delivery_message: portraitDeliveryNote || 'Your portrait is being created.',
      delivery_date: portraitDeliveryNote ? matchedOrder.updatedAt : null,
      portrait_link: portraitDeliveryNote?.match(/https?:\/\/\S+/)?.[0] || null,
      hours_elapsed: hoursElapsed,
      status: portraitDeliveryNote ? 'completed' : 'in_progress'
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
