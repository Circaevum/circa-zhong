#!/bin/bash
# Setup HTTPS for Nakama on DigitalOcean droplet using nakama.circaevum.com
# Run this script on your droplet AFTER setting up DNS

set -e

DOMAIN="nakama.circaevum.com"
EMAIL="your-email@circaevum.com"  # Change this to your email

echo "🔧 Setting up HTTPS for Nakama at $DOMAIN..."

# 1. Install nginx and certbot if not already installed
echo "📦 Installing nginx and certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Create nginx config for Nakama
echo "📝 Creating nginx configuration..."
sudo tee /etc/nginx/sites-available/nakama > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Let certbot handle the redirect after SSL is set up
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL will be configured by certbot
    # Temporary self-signed cert (will be replaced by Let's Encrypt)
    
    # Proxy to Nakama
    location / {
        proxy_pass http://localhost:7350;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # WebSocket support (Nakama uses WebSockets)
        proxy_set_header Connection "upgrade";
        
        # Increase timeouts for long-lived connections
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

# 3. Enable the site
echo "🔗 Enabling nginx site..."
sudo ln -sf /etc/nginx/sites-available/nakama /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# 4. Test nginx config
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# 5. Start/restart nginx
echo "🚀 Starting nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

# 6. Get SSL certificate with Let's Encrypt
echo ""
echo "🔒 Getting SSL certificate from Let's Encrypt..."
echo "⚠️  IMPORTANT: Make sure DNS A record for $DOMAIN points to $(curl -s ifconfig.me 2>/dev/null || echo 'this server')"
echo ""
read -p "Press Enter when DNS is configured and propagated (can take a few minutes), or Ctrl+C to cancel..."

sudo certbot --nginx -d $DOMAIN \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    --redirect

# 7. Test auto-renewal
echo "🔄 Testing certificate auto-renewal..."
sudo certbot renew --dry-run

echo ""
echo "✅ HTTPS setup complete!"
echo ""
echo "📋 Update GitHub Actions variables:"
echo "   - VITE_NAKAMA_SCHEME=https"
echo "   - VITE_NAKAMA_HOST=$DOMAIN"
echo "   - VITE_NAKAMA_PORT=443"
echo ""
echo "🌐 Your Nakama server is now available at: https://$DOMAIN"
