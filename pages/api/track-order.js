export default async function handler(req, res) {
  // --- Basic Validation ---
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, orderNumber } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Missing email address' });
  }

  // --- Shopify API Configuration ---
  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  // Check if environment variables are loaded
  if (!shop || !accessToken) {
    console.error('Missing Shopify environment variables');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  // --- Build the Shopify Search Query ---
  const queryParts = [
    `email:'${email.trim()}'`,
    'status:any'
  ];

  if (orderNumber) {
    const formattedOrderNumber = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;
    queryParts.push(`name:'${formattedOrderNumber.trim()}'`);
  }

  const filterQuery = queryParts.join(' AND ');

  let allMatchingOrders = [];
  let hasNextPage = true;
  let endCursor = null;

  try {
    while (hasNextPage) {
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

      const variables = {
        cursor: endCursor,
        filterQuery: filterQuery
      };

      const response = await fetch(`https://${shop}/admin/api/2024-04/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      const json = await response.json();

      if (json.errors) {
        console.error('Shopify API Errors:', JSON.stringify(json.errors, null, 2));
        return res.status(502).json({ 
            error: 'An error occurred with the Shopify API.',
            shopify_errors: json.errors 
        });
      }
      
      if (!json.data || !json.data.orders) {
          console.error('Unexpected API response structure:', json);
          throw new Error('Invalid response structure from Shopify API.');
      }

      const { edges, pageInfo } = json.data.orders;
      
      allMatchingOrders.push(...edges.map(edge => edge.node));

      hasNextPage = pageInfo.hasNextPage;
      endCursor = pageInfo.endCursor;
    }

    // --- LITMUS TEST CHANGE ---
    // If no orders are found, we return this very specific message.
    // This will prove whether the latest code is actually running on the server.
    if (allMatchingOrders.length === 0) {
      return res.status(404).json({ error: 'LITMUS_TEST_V4: No orders found. If you see this, the new code is running correctly.' });
    }

    const formattedOrders = allMatchingOrders.map(order => {
        const createdAt = new Date(order.createdAt);
        const now = new Date();
        const hoursElapsed = Math.floor((now - createdAt) / (1000 * 60 * 60));

        const events = order.events.edges.map(e => e.node);
        const deliveryEvent = events.find(e =>
            e.message?.toLowerCase().includes('portrait') || e.message?.includes('http')
        );

        const portraitLink = deliveryEvent?.message?.match(/https?:\/\/\S+/)?.[0] || '';
        
        const trackingInfo = order.fulfillments[0]?.trackingInfo[0];

        return {
            order_number: order.name,
            email: order.email,
            order_date: order.createdAt,
            total_price: order.totalPriceSet.shopMoney.amount,
            currency: order.totalPriceSet.shopMoney.currencyCode,
            hours_elapsed: hoursElapsed,
            portrait_delivered: !!portraitLink,
            portrait_link: portraitLink,
            tracking_number: trackingInfo?.number || null,
            tracking_url: trackingInfo?.url || null,
            status: portraitLink ? 'complete' : 'in_progress',
        };
    });

    return res.status(200).json({ orders: formattedOrders });

  } catch (error) {
    console.error('API handler error:', error);
    return res.status(500).json({ 
        error: 'Internal server error',
        details: error.message 
    });
  }
}
