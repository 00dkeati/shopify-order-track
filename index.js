// Node.js backend for Shopify order tracking
// Deploy this to Vercel, Netlify Functions, or any hosting service

const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for all origins (fixed)
app.use(cors({
    origin: '*'
}));

app.use(express.json());

// Configuration - Use environment variables in production
const SHOPIFY_CONFIG = {
    store: process.env.SHOPIFY_STORE || 'your-store-name.myshopify.com',
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || 'your-admin-api-access-token',
    apiVersion: '2023-10'
};

// Track portrait delivery endpoint
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

        // Get order events/timeline to check for portrait delivery
        const eventsResponse = await fetch(
            `https://${SHOPIFY_CONFIG.store}/admin/api/${SHOPIFY_CONFIG.apiVersion}/orders/${order.id}/events.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken,
                    'Content-Type': 'application/json'
                }
            }
        );

        let portraitDelivered = false;
        let deliveryMessage = '';
        let portraitLink = '';
        let deliveryDate = '';

        if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            
            // Check events for uploaded portrait files
            for (const event of eventsData.events) {
                const message = event.message || '';
                
                // Look for uploaded image files in timeline
                const imageRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|bmp|tiff|webp)/i;
                const imageMatch = message.match(imageRegex);
                
                // Also check for Shopify CDN links (common upload pattern)
                const shopifyFileRegex = /https?:\/\/cdn\.shopify\.com\/[^\s]+/i;
                const shopifyFileMatch = message.match(shopifyFileRegex);
                
                // Check for file attachment indicators
                const hasFileAttachment = message.includes('uploaded') || 
                                        message.includes('attached') || 
                                        message.includes('file:') ||
                                        message.includes('image:') ||
                                        imageMatch ||
                                        shopifyFileMatch;
                
                if (hasFileAttachment) {
                    portraitDelivered = true;
                    deliveryMessage = message;
                    deliveryDate = event.created_at;
                    
                    // Extract the image URL
                    if (imageMatch) {
                        portraitLink = imageMatch[0];
                    } else if (shopifyFileMatch) {
                        portraitLink = shopifyFileMatch[0];
                    }
                    break; // Use the first/most recent file upload
                }
            }
        }

        // If no file found in events, also check order notes
        if (!portraitDelivered && order.note) {
            const noteImageRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|bmp|tiff|webp)/i;
            const noteImageMatch = order.note.match(noteImageRegex);
            
            if (noteImageMatch) {
                portraitDelivered = true;
                deliveryMessage = order.note;
                portraitLink = noteImageMatch[0];
                deliveryDate = order.updated_at;
            }
        }

        // Calculate time since order
        const orderDate = new Date(order.created_at);
        const now = new Date();
        const hoursElapsed = Math.floor((now - orderDate) / (1000 * 60 * 60));

        // Format response for portrait tracking
        const portraitInfo = {
            order_number: order.order_number || order.name,
            email: order.email,
            order_date: order.created_at,
            total_price: order.total_price,
            currency: order.currency,
            hours_elapsed: hoursElapsed,
            portrait_delivered: portraitDelivered,
            delivery_message: deliveryMessage,
            portrait_link: portraitLink,
            delivery_date: deliveryDate,
            status: portraitDelivered ? 'delivered' : 'in_progress'
        };

        res.json(portraitInfo);

    } catch (error) {
        console.error('Error tracking portrait order:', error);
        res.status(500).json({ 
            error: 'Internal server error. Please try again later.' 
        });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Shopify Order Tracking API',
        status: 'OK',
        endpoints: {
            health: '/api/health',
            trackOrder: '/api/track-order (POST)'
        }
    });
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
