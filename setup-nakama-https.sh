#!/bin/bash
# Setup HTTPS for Nakama on DigitalOcean droplet
# Run this script on your droplet (or follow these steps manually)

set -e

echo "🔧 Setting up HTTPS for Nakama..."

# 1. Install nginx and certbot if not already installed
echo "📦 Installing nginx and certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Create nginx config for Nakama
echo "📝 Creating nginx configuration..."
sudo tee /etc/nginx/sites-available/nakama > /dev/null <<EOF
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;  # Replace with your domain or IP
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN_OR_IP;  # Replace with your domain or IP
    
    # SSL configuration (will be filled by certbot)
    # ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
    
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
    }
}
EOF

# 3. Enable the site
echo "🔗 Enabling nginx site..."
sudo ln -sf /etc/nginx/sites-available/nakama /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default  # Remove default if exists

# 4. Test nginx config
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# 5. Start/restart nginx
echo "🚀 Starting nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

# 6. Get SSL certificate with Let's Encrypt
# Replace nakama.circaevum.com with your subdomain
echo "🔒 Getting SSL certificate from Let's Encrypt..."
echo "⚠️  Make sure DNS A record for nakama.circaevum.com points to this server first!"
read -p "Press Enter when DNS is configured, or Ctrl+C to cancel..."
sudo certbot --nginx -d nakama.circaevum.com --non-interactive --agree-tos --email your-email@circaevum.com

echo ""
echo "✅ Basic setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. If you have a domain:"
echo "   - Update DNS A record to point to $(curl -s ifconfig.me)"
echo "   - Run: sudo certbot --nginx -d your-domain.com"
echo ""
echo "2. If using IP only (self-signed cert):"
echo "   - See setup-self-signed.sh"
echo ""
echo "3. Update GitHub Actions variables:"
echo "   - VITE_NAKAMA_SCHEME=https"
echo "   - VITE_NAKAMA_HOST=your-domain.com (or IP)"
echo "   - VITE_NAKAMA_PORT=443 (or 80 if no SSL yet)"
