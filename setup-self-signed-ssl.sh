#!/bin/bash
# Setup self-signed SSL certificate for Nakama (testing only)
# WARNING: Browsers will show security warnings. Use a real domain + Let's Encrypt for production.

set -e

echo "🔒 Setting up self-signed SSL certificate..."

# 1. Create directory for certificates
sudo mkdir -p /etc/nginx/ssl

# 2. Generate self-signed certificate
echo "📜 Generating self-signed certificate..."
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/nakama.key \
    -out /etc/nginx/ssl/nakama.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=142.93.251.136"

# 3. Update nginx config with SSL
sudo tee /etc/nginx/sites-available/nakama > /dev/null <<EOF
server {
    listen 80;
    server_name 142.93.251.136;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name 142.93.251.136;
    
    ssl_certificate /etc/nginx/ssl/nakama.crt;
    ssl_certificate_key /etc/nginx/ssl/nakama.key;
    
    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
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
        
        # WebSocket support
        proxy_set_header Connection "upgrade";
    }
}
EOF

# 4. Test and restart nginx
sudo nginx -t
sudo systemctl restart nginx

echo ""
echo "✅ Self-signed certificate installed!"
echo ""
echo "⚠️  WARNING: Browsers will show security warnings."
echo "   Users will need to click 'Advanced' → 'Proceed anyway'"
echo ""
echo "📋 Update GitHub Actions variables:"
echo "   - VITE_NAKAMA_SCHEME=https"
echo "   - VITE_NAKAMA_HOST=142.93.251.136"
echo "   - VITE_NAKAMA_PORT=443"
