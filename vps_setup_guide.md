# Hướng dẫn thiết lập Mikrotik Monitoring trên VPS hoặc máy chủ vật lý

## 1. Chuẩn bị môi trường

### Yêu cầu hệ thống
- Ubuntu 20.04 LTS hoặc mới hơn (khuyến nghị)
- Tối thiểu 2GB RAM
- Tối thiểu 10GB dung lượng đĩa
- Kết nối mạng ổn định

### Các bước chuẩn bị
1. Đăng nhập vào VPS/máy chủ vật lý bằng SSH
2. Đảm bảo hệ thống đã được cập nhật:
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

## 2. Triển khai Mikrotik Monitoring

### a. Tải và giải nén package
1. Tải về gói cài đặt Mikrotik Monitoring
2. Giải nén vào thư mục tạm thời:
   ```bash
   mkdir ~/MikrotikMonitor
   cd ~/MikrotikMonitor
   # Tải gói từ nguồn của bạn
   # Hoặc sao chép files từ máy local lên server bằng SCP/SFTP
   ```

### b. Sử dụng script cài đặt tự động
1. Cấp quyền thực thi cho script:
   ```bash
   chmod +x install_mikrotik_monitor.sh
   ```

2. Chạy script cài đặt:
   ```bash
   sudo ./install_mikrotik_monitor.sh
   ```

3. Script sẽ tự động:
   - Cài đặt các gói phụ thuộc cần thiết
   - Cài đặt Node.js và PM2
   - Cài đặt PostgreSQL và tạo cơ sở dữ liệu
   - Sao chép source code vào thư mục `/opt/mikrotik-monitoring`
   - Cấu hình PM2 để tự động khởi động ứng dụng
   - Cấu hình để server lắng nghe trên tất cả các giao diện (0.0.0.0)
   - Tạo file .env với các thiết lập cần thiết

## 3. Cấu hình tường lửa (Firewall)

### a. Sử dụng script cấu hình firewall tự động
1. Cấp quyền thực thi cho script:
   ```bash
   chmod +x configure_firewall.sh
   ```

2. Chạy script cấu hình firewall:
   ```bash
   sudo ./configure_firewall.sh
   ```

3. Script sẽ tự động:
   - Cài đặt và cấu hình UFW
   - Mở cổng SSH để bạn không bị khoá khỏi server
   - Mở cổng 5000 cho Mikrotik Monitoring
   - Cấu hình các quy tắc bảo mật nâng cao (nếu bạn chọn)

### b. Thủ công (nếu script không hoạt động)
```bash
sudo ufw allow ssh
sudo ufw allow 5000/tcp
sudo ufw --force enable
```

## 4. Khắc phục sự cố mạng LAN

Nếu bạn không thể truy cập ứng dụng từ các máy khác trong mạng LAN, hãy sử dụng script khắc phục:

1. Cấp quyền thực thi:
   ```bash
   chmod +x fix_network_access.sh
   ```

2. Chạy script:
   ```bash
   sudo ./fix_network_access.sh
   ```

3. Script sẽ:
   - Kiểm tra cấu hình mạng hiện tại
   - Xác định lỗi trong cấu hình server, firewall hoặc biến môi trường
   - Cung cấp các tùy chọn để sửa lỗi tự động
   - Khởi động lại ứng dụng với cấu hình mới

## 5. Quản lý ứng dụng

### Sử dụng PM2 để quản lý ứng dụng
- Kiểm tra trạng thái: `pm2 status`
- Khởi động lại: `pm2 restart mikrotik-monitor`
- Dừng ứng dụng: `pm2 stop mikrotik-monitor`
- Xem logs: `pm2 logs mikrotik-monitor`

### Cơ sở dữ liệu
- Kết nối đến PostgreSQL: `sudo -u postgres psql -d mikrotik_monitor`
- Thông tin kết nối DB đã được lưu vào file `/opt/mikrotik-monitoring/.env`

## 6. Truy cập ứng dụng

1. Lấy địa chỉ IP của server:
   ```bash
   hostname -I | awk '{print $1}'
   ```

2. Truy cập ứng dụng từ trình duyệt web:
   ```
   http://<địa_chỉ_IP>:5000
   ```

3. Đăng nhập với tài khoản mặc định (nếu có) hoặc thiết lập tài khoản mới

## 7. Cấu hình nâng cao

### a. HTTPS với Nginx (tuỳ chọn)
Nếu bạn muốn bảo mật kết nối bằng HTTPS, bạn có thể cài đặt Nginx làm reverse proxy:

1. Cài đặt Nginx:
   ```bash
   sudo apt install -y nginx
   ```

2. Tạo cấu hình site:
   ```bash
   sudo nano /etc/nginx/sites-available/mikrotik-monitor
   ```

3. Thêm cấu hình sau:
   ```
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

4. Kích hoạt cấu hình:
   ```bash
   sudo ln -s /etc/nginx/sites-available/mikrotik-monitor /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

5. Cài đặt Let's Encrypt cho HTTPS:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## 8. Khắc phục sự cố

### Không thể kết nối đến ứng dụng
1. Kiểm tra trạng thái ứng dụng:
   ```bash
   pm2 status
   ```

2. Kiểm tra logs:
   ```bash
   pm2 logs mikrotik-monitor
   ```

3. Kiểm tra cấu hình firewall:
   ```bash
   sudo ufw status
   ```

4. Kiểm tra kết nối đến cổng 5000:
   ```bash
   nc -zv localhost 5000
   ```

5. Khởi động lại ứng dụng:
   ```bash
   pm2 restart mikrotik-monitor
   ```

6. Tạm thời tắt firewall để kiểm tra:
   ```bash
   sudo ufw disable
   ```

### Không thể kết nối với thiết bị Mikrotik
1. Kiểm tra kết nối mạng đến thiết bị:
   ```bash
   ping <địa_chỉ_IP_thiết_bị>
   ```

2. Kiểm tra cổng API của Mikrotik:
   ```bash
   nc -zv <địa_chỉ_IP_thiết_bị> 8728
   nc -zv <địa_chỉ_IP_thiết_bị> 8729
   ```

3. Đảm bảo API đã được bật trên thiết bị Mikrotik (sử dụng WinBox hoặc WebFig)

## 9. Cập nhật ứng dụng

Để cập nhật ứng dụng lên phiên bản mới:

1. Dừng ứng dụng hiện tại:
   ```bash
   pm2 stop mikrotik-monitor
   ```

2. Sao lưu cấu hình hiện tại:
   ```bash
   cp /opt/mikrotik-monitoring/.env /opt/mikrotik-monitoring/.env.bak
   ```

3. Cập nhật source code:
   ```bash
   # Sao chép code mới vào thư mục /opt/mikrotik-monitoring
   ```

4. Cài đặt các gói phụ thuộc mới (nếu có):
   ```bash
   cd /opt/mikrotik-monitoring
   npm install
   ```

5. Khởi động lại ứng dụng:
   ```bash
   pm2 restart mikrotik-monitor
   ```

## 10. Hỗ trợ và liên hệ

Nếu bạn cần hỗ trợ thêm, vui lòng liên hệ:
- Email: your-email@example.com
- Website: https://your-support-website.com