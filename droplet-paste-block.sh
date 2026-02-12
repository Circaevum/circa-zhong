#!/bin/bash
# PASTE THIS ENTIRE BLOCK INTO THE DIGITALOCEAN CONSOLE (one paste).
# If the console forces caps, paste from this file - pasted text often keeps correct case.

sudo tee /etc/nginx/sites-available/nakama << 'NGINXEOF'
server {
    listen 80;
    server_name nakama.circaevum.com;
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        proxy_pass http://localhost:7350;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINXEOF
sudo ln -sf /etc/nginx/sites-available/nakama /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
echo Done. Run certbot next: sudo certbot --nginx -d nakama.circaevum.com --non-interactive --agree-tos --email YOUR_EMAIL@circaevum.com
