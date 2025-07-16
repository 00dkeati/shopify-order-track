// Node.js backend for Shopify order tracking
// Deploy this to Vercel, Netlify Functions, or any hosting service

const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for your Shopify store domain
app.use(cors({
  app.use(cors({
    origin: ['https://your-store.myshopify.com', 'https://your-custom-domain.com']
}));

app.use(express.json());

// Configuration - Use environment variables in production
const SHOPIFY_CONFIG = {
    store: process.env.SHOPIFY_STORE || 'your-store-name.myshopify.com',
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || 'your-admin-api-access-token',
    apiVersion: '2023-10'
};

// Track order endpoint
app.post('/api/track-order', async (req, res) => {
    try {
        const { orderNumber, email } = req.body;
        
        if (!orderNumber || !email) {
            return res.status(400).json({ 
                error: 'Order number and email are required' 
            });
        }

        // Clean order number (remove # if present)
        const cleanOrderNumber = orderNumber.replace('#', '');
        
        // Search for order by order number
        const orderResponse = await fetch(
            `https://${SHOPIFY_CONFIG.store}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders.json?name=${cleanOrderNumber}&limit=1`,
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!orderResponse.ok) {
            throw new Error(`Shopify API error: ${orderResponse.status}`);
        }

        const orderData = await orderResponse.json();
        
        // Check if order exists and email matches
        const order = orderData.orders.find(o => 
            o.email && o.email.toLowerCase() === email.toLowerCase()
        );

        if (!order) {
            return res.status(404).json({ 
                error: 'Order not found or email does not match' 
            });
        }

        // Get fulfillment details if order is fulfilled
        let fulfillments = [];
        if (order.fulfillment_status && order.fulfillments) {
            fulfillments = order.fulfillments.map(f => ({
                tracking_number: f.tracking_number,
                tracking_company: f.tracking_company,
                tracking_url: f.tracking_url,
                status: f.status
            }));
        }

        // Format response
        const orderInfo = {
            order_number: order.order_number || order.name,
            email: order.email,
            financial_status: order.financial_status,
            fulfillment_status: order.fulfillment_status,
            created_at: order.created_at,
            total_price: order.total_price,
            currency: order.currency,
            shipping_address: order.shipping_address ? {
                city: order.shipping_address.city,
                province: order.shipping_address.province,
                country: order.shipping_address.country,
                zip: order.shipping_address.zip
            } : null,
            fulfillments: fulfillments
        };

        res.json(orderInfo);

    } catch (error) {
        console.error('Error tracking order:', error);
        res.status(500).json({ 
            error: 'Internal server error. Please try again later.' 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Shopify order tracking API running on port ${PORT}`);
});

// Export for serverless deployment (Vercel, Netlify)
module.exports = app;
