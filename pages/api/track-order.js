// Shopify GraphQL Order Tracker

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderNumber, email } = req.body;
  if (!orderNumber || !email) return res.status(400).json({ error: 'Order number and email are required' });

  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Missing Shopify credentials' });
  }

  const cleanOrderNumber = orderNumber.replace('#', '').trim();
  const endpoint = `https://${SHOPIFY_STORE}/admin/api/2023-10/graphql.json`;

  let cursor = null;
  let hasNextPage = true;

  try {
    while (hasNextPage) {
      const query = `
        query {
          orders(first: 50${cursor ? `, after: \
