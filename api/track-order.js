export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, orderNumber } = req.body;
  if (!email || !orderNumber) {
    return res.status(400).json({ error: 'Missing email or order number' });
  }

  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  if (!shop || !accessToken) {
    return res.status(500).json({ error: 'Shopify API credentials missing' });
  }

  const query = `
    query($cursor: String, $filterQuery: String!) {
      orders(first: 50, after: $cursor, query: $filterQuery, sortKey: CREATED_AT, reverse: true) {
        pageInfo {
          hasNextPage
          endCursor
        }
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
            fulfillments(first: 5) {
              trackingInfo {
                number
                url
              }
            }
            events(first: 10, sortKey: CREATED_AT, reverse: true) {
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

  const formattedOrderNumber = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;
  const filterQuery = \`email:'\${email}' AND name:'\${formattedOrderNumber}' AND status:any\`;

  let endCursor = null;
  let allOrders = [];

  try {
    while (true) {
      const response = await fetch(\`https://\${shop}/admin/api/2024-04/graphql.json\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({ query, variables: { cursor: endCursor, filterQuery } })
      });

      const json = await response.json();
      const edges = json?.data?.orders?.edges || [];
      const pageInfo = json?.data?.orders?.pageInfo;

      allOrders.push(...edges.map(e => e.node));
      if (!pageInfo?.hasNextPage) break;

      endCursor = pageInfo.endCursor;
    }

    if (allOrders.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = allOrders[0];
    const createdAt = new Date(order.createdAt);
    const now = new Date();
    const hoursElapsed = Math.floor((now - createdAt) / (1000 * 60 * 60));

    const events = order.events.edges.map(e => e.node);
    const deliveryEvent = events.find(e => e.message?.toLowerCase().includes('portrait') || e.message?.includes('http'));
    const portraitLink = deliveryEvent?.message?.match(/https?:\/\/\S+/)?.[0] || '';

    return res.status(200).json({
      order_number: order.name,
      email: order.email,
      order_date: order.createdAt,
      total_price: order.totalPriceSet.shopMoney.amount,
      currency: order.totalPriceSet.shopMoney.currencyCode,
      hours_elapsed: hoursElapsed,
      portrait_delivered: !!portraitLink,
      portrait_link: portraitLink,
      status: portraitLink ? 'complete' : 'in_progress'
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}